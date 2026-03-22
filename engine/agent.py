import asyncio
import os
import json
import time as time_mod
import random
from playwright.async_api import async_playwright
import google.generativeai as genai
from dotenv import load_dotenv
from database import GhostLogger

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise ValueError("GEMINI_API_KEY not set in .env")

genai.configure(api_key=api_key)
model = genai.GenerativeModel('gemini-2.0-flash')

SYSTEM_PROMPT = """You are a 'Ghost Consumer', an autonomous AI agent testing a website.
Adopt the persona given to you. You will receive the current page state as visible text.

Decide your NEXT action based on your persona's goals and pain points.

Respond ONLY with a raw JSON object — no markdown, no code fences:
{
  "thought_process": "<one sentence reasoning as the persona>",
  "action": "<one of: READ | CLICK | SCROLL_DOWN | BOUNCE | BUY>",
  "target": "<element text if action=CLICK, else empty string>"
}
"""


async def generate_content_with_retry(model, prompt_parts, max_retries=10):
    """Generates content with exponential backoff on 429 errors tailored for 15 RPM limit."""
    for attempt in range(max_retries):
        try:
            # Use generate_content_async to avoid blocking the event loop
            return await model.generate_content_async(prompt_parts, request_options={"timeout": 60})
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "Resource Exhausted" in err_str:
                # More aggressive backoff for 15 RPM limit
                # Wait 5s, 10s, 20s, 40s, 80s... with jitter
                wait_time = (5 * (2 ** attempt)) + random.uniform(0, 5)
                print(f"  [Quota] 429 hit. RPM limit likely reached. Retrying in {wait_time:.1f}s (Attempt {attempt+1}/{max_retries})...")
                await asyncio.sleep(wait_time)
            elif "500" in err_str or "503" in err_str:
                print(f"  [Gemini] Server error {err_str[:10]}. Retrying in 5s...")
                await asyncio.sleep(5)
            else:
                raise e
    raise Exception(f"Max retries ({max_retries}) exceeded for Gemini API")


async def run_ghost_agent(
    agent_id: str,
    url: str,
    persona: str,
    logger: GhostLogger,
    semaphore: asyncio.Semaphore,
    max_steps: int = 5,
) -> dict:
    """
    Runs one ghost agent. Returns:
      { agent_id, persona, final_status, thoughts: [str] }
    Always calls logger.increment_completed() on exit.
    """
    print(f"\n--- Spawning [{agent_id}] ---")

    session_id  = logger.create_session(agent_id, persona)
    thoughts    = []
    final_status = "TIMED_OUT"

    async with semaphore:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36 GhostMarketBot/3.0"
                ),
            )
            page = await context.new_page()

            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=45_000)
                await page.wait_for_timeout(2_000)

                for step in range(1, max_steps + 1):
                    step_start = time_mod.monotonic()

                    current_url = page.url
                    visible_text = await page.evaluate(
                        "() => document.body.innerText.substring(0, 5000)"
                    )

                    prompt = (
                        f"Current Persona: {persona}\n"
                        f"Current URL: {current_url}\n\n"
                        f"--- VISIBLE WEBPAGE CONTENT ---\n{visible_text}\n"
                        f"-------------------------------\n\n"
                        f"What is your next action? Respond ONLY in JSON."
                    )

                    # Wrap generation in retry logic
                    try:
                        response = await generate_content_with_retry(model, [
                            {"role": "user",  "parts": [SYSTEM_PROMPT]},
                            {"role": "model", "parts": ["Understood. Returning strict JSON."]},
                            {"role": "user",  "parts": [prompt]},
                        ])
                        raw = response.text.replace("```json\n", "").replace("```", "").strip()
                        decision = json.loads(raw)
                    except (json.JSONDecodeError, Exception) as e:
                        err_msg = f"AI Error: {str(e)[:100]}"
                        print(f"[{agent_id}] {err_msg}")
                        # Log the error step before breaking
                        logger.log_step(
                            session_id, step, f"Failed to get valid decision: {err_msg}",
                            "ERROR", "", page_url=current_url, duration_ms=int((time_mod.monotonic() - step_start)*1000)
                        )
                        final_status = "ERROR"
                        break

                    elapsed_ms = int((time_mod.monotonic() - step_start) * 1000)
                    thought  = decision.get("thought_process", "")
                    action   = decision.get("action", "READ")
                    target   = decision.get("target", "")
                    print(f"[{agent_id}] Step {step} {action}: {thought[:80]}")

                    # ── telemetry defaults ────────────────────────────────
                    scroll_depth   = None
                    action_success = None

                    # ── execute action ────────────────────────────────────
                    if action == "BOUNCE":
                        final_status = "BOUNCED"
                        logger.update_session_status(session_id, "BOUNCED")
                        # log before break
                        logger.log_step(
                            session_id, step, thought, action, target,
                            page_url=current_url, scroll_depth=None,
                            action_success=None, duration_ms=elapsed_ms,
                        )
                        thoughts.append(f"[{step}] BOUNCE: {thought}")
                        break

                    elif action == "BUY":
                        final_status = "CONVERTED"
                        logger.update_session_status(session_id, "CONVERTED")
                        logger.log_step(
                            session_id, step, thought, action, target,
                            page_url=current_url, scroll_depth=None,
                            action_success=None, duration_ms=elapsed_ms,
                        )
                        thoughts.append(f"[{step}] BUY: {thought}")
                        break

                    elif action == "SCROLL_DOWN":
                        await page.evaluate("window.scrollBy(0, window.innerHeight)")
                        await page.wait_for_timeout(800)
                        # Measure scroll depth 0-100
                        scroll_depth = int(await page.evaluate(
                            """() => {
                                const scrollable = document.body.scrollHeight - window.innerHeight;
                                if (scrollable <= 0) return 100;
                                return Math.min(100, Math.round(window.scrollY / scrollable * 100));
                            }"""
                        ))

                    elif action == "READ":
                        await page.wait_for_timeout(2_000)

                    elif action == "CLICK" and target:
                        locator = page.get_by_text(target, exact=False).first
                        if await locator.is_visible():
                            await locator.click()
                            await page.wait_for_load_state("domcontentloaded")
                            await page.wait_for_timeout(1_500)
                            action_success = True
                        else:
                            action_success = False
                            print(f"[{agent_id}] ⚠ '{target}' not found.")

                    logger.log_step(
                        session_id, step, thought, action, target,
                        page_url=current_url,
                        scroll_depth=scroll_depth,
                        action_success=action_success,
                        duration_ms=elapsed_ms,
                    )
                    thoughts.append(f"[{step}] {action}: {thought}")

            except Exception as exc:
                print(f"[{agent_id}] Browser error: {exc}")
                final_status = "ERROR"
            finally:
                logger.update_session_status(session_id, final_status)
                logger.increment_completed()
                await context.close()
                await browser.close()
                print(f"[{agent_id}] done → {final_status}")

    return {
        "agent_id":     agent_id,
        "persona":      persona,
        "final_status": final_status,
        "thoughts":     thoughts,
    }


if __name__ == "__main__":
    from database import create_simulation, init_db

    async def _test():
        init_db()
        sim_id = create_simulation("https://example.com", 1)
        logger = GhostLogger(sim_id)
        sem    = asyncio.Semaphore(1)
        result = await run_ghost_agent(
            "Test-1", "https://example.com",
            "An impatient 60-year-old who wants a phone number immediately.",
            logger, sem, max_steps=3,
        )
        print(result)

    asyncio.run(_test())
