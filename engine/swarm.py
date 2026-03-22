import asyncio
import time
import random
import sys
import os
from typing import Optional
from agent import run_ghost_agent
from database import create_simulation, end_simulation, save_report, GhostLogger, init_db, update_simulation_status
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel('gemini-2.0-flash')

# ── 20 Rich Persona Archetypes ────────────────────────────────────────────────
GHOST_PERSONAS = [
    # Budget / Young
    "You are Maya, a 22-year-old college student with $30/month to spend. Only buys if there's a student discount or free trial. Gets bored in seconds on mobile.",
    "You are Jake, a 19-year-old Gen-Z consumer. Judges a site in 4 seconds on aesthetics alone. Bounces if there's no visual excitement.",
    "You are Sofia, a 25-year-old gig worker obsessed with price. Bounces the moment she sees hidden fees or expensive shipping.",
    # Mid-career
    "You are Marcus, a 34-year-old product manager who needs ROI data and case studies to justify any purchase to his CFO.",
    "You are Priya, a 38-year-old marketing director who demands HubSpot + Salesforce integrations. Bounces in 2 clicks if integrations aren't visible.",
    "You are Daniel, a 31-year-old senior engineer who hates buzzwords and immediately hunts for GitHub links or API docs.",
    "You are Aisha, a 29-year-old UX designer who treats the site itself as the product demo. Bad UX = bounce.",
    # Executives
    "You are Robert, a 52-year-old VP of Sales who needs SOC 2 / GDPR compliance and an SLA mentioned before he trusts anyone.",
    "You are Carol, a 47-year-old CEO of a 15-person company. Time-poor. Needs to grasp value in 10 seconds or she closes the tab.",
    "You are Hiro, a 44-year-old CTO who fears vendor lock-in and reads infrastructure docs before looking at pricing.",
    # Niche
    "You are Beverly, a 68-year-old retiree who gets frustrated by jargon. Bounces if there's no live chat or 'Getting Started' guide.",
    "You are Tyler, a 27-year-old running 3 Shopify stores. Jumps straight to Pricing. Bounces without a free tier or Shopify integration.",
    "You are Fatima, a 35-year-old non-profit director looking for discounted or grant-eligible pricing. Bounces on enterprise-only pricing.",
    "You are Leo, a compulsive impulse buyer who immediately clicks BUY if he sees a countdown timer or scarcity badge.",
    "You are Sam, a methodical researcher who reads FAQ, About Us, blog, and reviews before ever considering buying.",
    # Skeptics
    "You are Alex, a 42-year-old journalist who hunts for red flags: vague promises, hidden pricing, fake testimonials.",
    "You are Nina, a 26-year-old PhD who reads the Privacy Policy and ToS. Bounces immediately if they aren't in the footer.",
    "You are Greg, a competitor analyst systematically clicking every nav link to build an intelligence report.",
    "You are Mia, a 33-year-old influencer who bounces if brand colors look dated. Only converts if there's an affiliate program.",
    "You are Omar, a 50-year-old SMB owner burned by a scammer. Needs a physical address and phone number before trusting anyone.",
]

# ── Concurrency Tiers ─────────────────────────────────────────────────────────
def _tier(num_ghosts: int) -> tuple[int, int, str]:
    """Returns (max_workers, semaphore_limit, tier_name)."""
    # Reduced concurrency to stay within Gemini Free Tier (15 RPM)
    if num_ghosts <= 10:
        return 3,  5,  "Small"
    elif num_ghosts <= 50:
        return 5,  8,  "Medium"
    else:
        return 8,  10, "Large"


async def _generate_report_with_retry(target_url, results, max_retries=3):
    """Generates AI report with retries for quota errors."""
    for attempt in range(max_retries):
        try:
            return await _generate_report(target_url, results)
        except Exception as e:
            if "429" in str(e) or "Resource Exhausted" in str(e):
                wait_time = (10 ** (attempt + 1)) + random.uniform(0, 5) # Heavier wait for report
                print(f"[Swarm] Report generation hit quota. Retrying in {wait_time:.1f}s...")
                await asyncio.sleep(wait_time)
            else:
                raise e
    raise Exception("Max retries exceeded for Swarm Report generation")


# ── Worker-pool pattern ───────────────────────────────────────────────────────
async def _worker(
    worker_id: int,
    queue: asyncio.Queue,
    url: str,
    logger: GhostLogger,
    semaphore: asyncio.Semaphore,
    results: list,
):
    """Pulls persona tasks from the queue until exhausted."""
    while True:
        try:
            agent_id, persona = queue.get_nowait()
        except asyncio.QueueEmpty:
            break

        # Aggressively stagger start to avoid hitting RPM limit
        # Random delay between 5 and 15 seconds
        stagger_delay = random.uniform(5.0, 15.0)
        print(f"[Worker-{worker_id}] Staggering start (waiting {stagger_delay:.1f}s)...")
        await asyncio.sleep(stagger_delay)

        try:
            result = await run_ghost_agent(agent_id, url, persona, logger, semaphore, max_steps=5)
            results.append(result)
        except Exception as exc:
            print(f"[Worker-{worker_id}] Agent error: {exc}")
        finally:
            queue.task_done()


# ── AI Report Generator ───────────────────────────────────────────────────────
async def _generate_report(target_url: str, results: list[dict]) -> str:
    print("\n\033[96m[Report] Generating AI Analyst Report...\033[0m")
    total     = len(results)
    converted = sum(1 for r in results if r["final_status"] == "CONVERTED")
    bounced   = sum(1 for r in results if r["final_status"] == "BOUNCED")
    timed_out = total - converted - bounced

    lines = []
    for r in results:
        thoughts_str = " | ".join(r.get("thoughts", []))[:400]
        lines.append(f"- {r['agent_id']} ({r['final_status']}): {r['persona'][:80]}... → {thoughts_str}")

    prompt = f"""You are a senior UX and CRO analyst. A synthetic swarm of {total} ghost consumers just tested: {target_url}

Results: {converted} converted ({round(converted/total*100,1) if total>0 else 0}%), {bounced} bounced, {timed_out} timed out.

Agent behavior summary:
{chr(10).join(lines)}

Write a structured analytics report with these sections:
## Executive Summary
## Key Friction Points
## Top Performing Elements
## High-Risk Personas
## Priority Recommendations
## Predicted Real-World Impact

Be specific, data-driven, and actionable. No fluff."""

    response = model.generate_content(prompt)
    return response.text


# ── Main Swarm Orchestrator ───────────────────────────────────────────────────
async def run_swarm(target_url: str, num_ghosts: int = 5, simulation_id: Optional[int] = None):
    max_workers, sem_limit, tier_name = _tier(num_ghosts)

    print(f"\n\033[96m{'='*52}\033[0m")
    print(f"\033[96m  Ghost Swarm  |  {num_ghosts} agents  |  Tier: {tier_name}\033[0m")
    print(f"\033[96m  Workers: {max_workers}  |  Semaphore: {sem_limit}  |  Target: {target_url}\033[0m")
    print(f"\033[96m{'='*52}\033[0m\n")

    start_time = time.time()
    init_db()

    # Use pre-created simulation_id if provided (created by the trigger API),
    # otherwise create a new one (e.g. when running from CLI directly).
    if simulation_id is None:
        simulation_id = create_simulation(target_url, num_ghosts)
    else:
        update_simulation_status(simulation_id, 'running')

    logger    = GhostLogger(simulation_id)
    semaphore = asyncio.Semaphore(sem_limit)

    # Build persona list (sample without replacement up to len(GHOST_PERSONAS), then repeat)
    pool = random.sample(GHOST_PERSONAS, min(num_ghosts, len(GHOST_PERSONAS)))
    if num_ghosts > len(GHOST_PERSONAS):
        pool += random.choices(GHOST_PERSONAS, k=num_ghosts - len(GHOST_PERSONAS))

    # Fill the queue
    queue: asyncio.Queue = asyncio.Queue()
    for i, persona in enumerate(pool):
        await queue.put((f"Ghost-{i+1}", persona))

    results: list[dict] = []

    # Spawn workers
    workers = [
        asyncio.create_task(_worker(w, queue, target_url, logger, semaphore, results))
        for w in range(1, max_workers + 1)
    ]
    await asyncio.gather(*workers)

    # Attempt AI Report — non-fatal: if Gemini fails or times out, sim still completes
    try:
        report = await asyncio.wait_for(
            _generate_report_with_retry(target_url, results),
            timeout=180  # 3-minute hard cap for report + retries
        )
        save_report(simulation_id, report)
        print(f"[Swarm] AI report saved for SIM-{simulation_id}")
    except asyncio.TimeoutError:
        print(f"[Swarm] ⚠ Gemini report timed out after 180s — sim still marked completed")
    except Exception as exc:
        print(f"[Swarm] ⚠ Gemini report failed ({exc}) — sim still marked completed")

    # Always finalise the simulation row, even without a report
    end_simulation(simulation_id)

    elapsed = time.time() - start_time
    print(f"\n\033[96m{'='*52}\033[0m")
    print(f"\033[96m  Swarm complete  |  {elapsed:.1f}s  |  SIM-{simulation_id}\033[0m")
    print(f"\033[96m{'='*52}\033[0m\n")
    return simulation_id



if __name__ == "__main__":
    url        = sys.argv[1] if len(sys.argv) >= 2 else "https://example.com"
    num_ghosts = int(sys.argv[2]) if len(sys.argv) >= 3 else 5
    sim_id     = int(sys.argv[3]) if len(sys.argv) >= 4 else None
    asyncio.run(run_swarm(url, num_ghosts, simulation_id=sim_id))
