import asyncio
import time
import random
import sys
import os
import json
from typing import Optional
from agent import run_ghost_agent, generate_content_with_retry
from database import create_simulation, end_simulation, save_report, GhostLogger, init_db, update_simulation_status, add_debate_message, save_projected_stats
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel('gemini-2.0-flash')

# ── 20 Rich Persona Archetypes ────────────────────────────────────────────────
STATIC_PERSONAS_WITH_METADATA = [
    {"name": "Maya", "segment": "Budget / Young", "persona": "You are Maya, a 22-year-old college student with $30/month to spend. Only buys if there's a student discount or free trial. Gets bored in seconds on mobile."},
    {"name": "Jake", "segment": "Budget / Young", "persona": "You are Jake, a 19-year-old Gen-Z consumer. Judges a site in 4 seconds on aesthetics alone. Bounces if there's no visual excitement."},
    {"name": "Sofia", "segment": "Budget / Young", "persona": "You are Sofia, a 25-year-old gig worker obsessed with price. Bounces the moment she sees hidden fees or expensive shipping."},
    {"name": "Marcus", "segment": "Mid-Career Pro", "persona": "You are Marcus, a 34-year-old product manager who needs ROI data and case studies to justify any purchase to his CFO."},
    {"name": "Priya", "segment": "Mid-Career Pro", "persona": "You are Priya, a 38-year-old marketing director who demands HubSpot + Salesforce integrations. Bounces in 2 clicks if integrations aren't visible."},
    {"name": "Daniel", "segment": "Mid-Career Pro", "persona": "You are Daniel, a 31-year-old senior engineer who hates buzzwords and immediately hunts for GitHub links or API docs."},
    {"name": "Aisha", "segment": "Mid-Career Pro", "persona": "You are Aisha, a 29-year-old UX designer who treats the site itself as the product demo. Bad UX = bounce."},
    {"name": "Robert", "segment": "Executive", "persona": "You are Robert, a 52-year-old VP of Sales who needs SOC 2 / GDPR compliance and an SLA mentioned before he trusts anyone."},
    {"name": "Carol", "segment": "Executive", "persona": "You are Carol, a 47-year-old CEO of a 15-person company. Time-poor. Needs to grasp value in 10 seconds or she closes the tab."},
    {"name": "Hiro", "segment": "Executive", "persona": "You are Hiro, a 44-year-old CTO who fears vendor lock-in and reads infrastructure docs before looking at pricing."},
    {"name": "Beverly", "segment": "Niche / Specialist", "persona": "You are Beverly, a 68-year-old retiree who gets frustrated by jargon. Bounces if there's no live chat or 'Getting Started' guide."},
    {"name": "Tyler", "segment": "Niche / Specialist", "persona": "You are Tyler, a 27-year-old running 3 Shopify stores. Jumps straight to Pricing. Bounces without a free tier or Shopify integration."},
    {"name": "Fatima", "segment": "Niche / Specialist", "persona": "You are Fatima, a 35-year-old non-profit director looking for discounted or grant-eligible pricing. Bounces on enterprise-only pricing."},
    {"name": "Leo", "segment": "Niche / Specialist", "persona": "You are Leo, a compulsive impulse buyer who immediately clicks BUY if he sees a countdown timer or scarcity badge."},
    {"name": "Sam", "segment": "Niche / Specialist", "persona": "You are Sam, a methodical researcher who reads FAQ, About Us, blog, and reviews before ever considering buying."},
    {"name": "Alex", "segment": "Skeptic / Edge", "persona": "You are Alex, a 42-year-old journalist who hunts for red flags: vague promises, hidden pricing, fake testimonials."},
    {"name": "Nina", "segment": "Skeptic / Edge", "persona": "You are Nina, a 26-year-old PhD who reads the Privacy Policy and ToS. Bounces immediately if they aren't in the footer."},
    {"name": "Greg", "segment": "Skeptic / Edge", "persona": "You are Greg, a competitor analyst systematically clicking every nav link to build an intelligence report."},
    {"name": "Mia", "segment": "Skeptic / Edge", "persona": "You are Mia, a 33-year-old influencer who bounces if brand colors look dated. Only converts if there's an affiliate program."},
    {"name": "Omar", "segment": "Skeptic / Edge", "persona": "You are Omar, a 50-year-old SMB owner burned by a scammer. Needs a physical address and phone number before trusting anyone."},
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


async def _generate_report_with_retry(target_url, results, simulation_id, max_retries=3):
    """Generates AI report with retries for quota errors."""
    for attempt in range(max_retries):
        try:
            return await _generate_report(target_url, results, simulation_id)
        except Exception as e:
            if "429" in str(e) or "Resource Exhausted" in str(e):
                wait_time = (10 ** (attempt + 1)) + random.uniform(0, 5) # Heavier wait for report
                print(f"[Swarm] Report generation hit quota. Retrying in {wait_time:.1f}s...")
                await asyncio.sleep(wait_time)
            else:
                raise e
    raise Exception("Max retries exceeded for Swarm Report generation")


async def _extract_landing_page_text(url: str) -> str:
    """Quickly launches Playwright to extract the landing page's main visible text."""
    from playwright.async_api import async_playwright
    print(f"[Persona Engine] Analyzing landing page: {url}...")
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            # Set a 15-second timeout for this initial analysis
            await page.goto(url, wait_until="domcontentloaded", timeout=15000)
            await page.wait_for_timeout(1000)
            text = await page.evaluate("() => document.body.innerText.substring(0, 4000)")
            await browser.close()
            return text
    except Exception as e:
        print(f"[Persona Engine] Landing page analysis failed/timed out: {e}. Using URL only.")
        return ""


async def _generate_dynamic_personas(target_url: str, page_content: str, num_ghosts: int) -> list[dict]:
    """Generates personas dynamically based on the website's landing page content."""
    print(f"[Persona Engine] Requesting {num_ghosts} dynamic personas from Gemini...")
    
    prompt = f"""You are a UX Research Director.
We are running a simulated user-testing swarm on the following website: {target_url}

Here is the visible text content from the landing page of the website:
--- START OF CONTENT ---
{page_content}
--- END OF CONTENT ---

Generate a list of {num_ghosts} distinct, highly realistic customer personas that would visit this site.
Each persona must have:
1. "name": A realistic first name (e.g. "Maya", "Robert").
2. "segment": One of the following 5 segments:
   - "Budget / Young" (price-sensitive, students, gig workers, younger demographics)
   - "Mid-Career Pro" (business professional, developers, marketers, designers, ROI-focused)
   - "Executive" (decision-makers, CEOs, VPs, CTOs, compliance/SLA-focused)
   - "Niche / Specialist" (seniors, shopify owners, non-profits, impulse buyers, researchers)
   - "Skeptic / Edge" (critics, competitor analysts, privacy advocates, security researchers)
3. "persona": A detailed description of the persona, their budget, motivation, what makes them convert (e.g., "BUY" trigger), and what makes them bounce (e.g., "BOUNCE" trigger). Format it like: "You are <Name>, a <Age>-year-old <Role/Profession> who <Motivation/Pain Point>. You only convert if <Conversion Trigger>. You bounce if <Bounce Trigger>."

Ensure the generated personas are diverse and represent a balanced mix across the segments.

Return ONLY a valid JSON array of objects. Do not include markdown code fences, headers, or any extra text.
JSON Structure:
[
  {{
    "name": "Name",
    "segment": "Budget / Young",
    "persona": "You are..."
  }},
  ...
]
"""
    try:
        response = await generate_content_with_retry(model, prompt)
        raw_text = response.text.replace("```json", "").replace("```", "").strip()
        personas = json.loads(raw_text)
        if isinstance(personas, list) and len(personas) > 0:
            print(f"[Persona Engine] Successfully generated {len(personas)} custom personas.")
            return personas
    except Exception as e:
        print(f"[Persona Engine] Failed to generate personas dynamically: {e}. Falling back to default personas.")
    
    # Fallback to default static personas
    pool = random.sample(STATIC_PERSONAS_WITH_METADATA, min(num_ghosts, len(STATIC_PERSONAS_WITH_METADATA)))
    if num_ghosts > len(STATIC_PERSONAS_WITH_METADATA):
        pool += random.choices(STATIC_PERSONAS_WITH_METADATA, k=num_ghosts - len(STATIC_PERSONAS_WITH_METADATA))
    return pool


async def run_swarm_debate(simulation_id: int, target_url: str, results: list[dict]):
    """Orchestrates a real-time focus group/debate between agents with different experiences."""
    converted = [r for r in results if r["final_status"] == "CONVERTED"]
    bounced = [r for r in results if r["final_status"] == "BOUNCED"]
    timed_out = [r for r in results if r["final_status"] in ("TIMED_OUT", "ERROR")]
    
    participants = []
    random.shuffle(converted)
    random.shuffle(bounced)
    random.shuffle(timed_out)
    
    participants.extend(converted[:2])
    participants.extend(bounced[:2])
    participants.extend(timed_out[:2])
    
    # If we have less than 4, just add others until we have some
    if len(participants) < 4:
        for r in results:
            if r not in participants:
                participants.append(r)
            if len(participants) >= 4:
                break
                
    if not participants:
        print("[Debate] No agents ran successfully, skipping debate.")
        return
        
    print(f"\n\033[95m[Debate] Starting focus group debate with {len(participants)} agents...\033[0m")
    
    debate_history = []
    
    # Round 1: Opening Statements
    for agent in participants:
        agent_id = agent["agent_id"]
        persona = agent["persona"]
        status = agent["final_status"]
        thoughts = " | ".join(agent.get("thoughts", []))
        
        prompt = f"""You are a customer representing this persona: "{persona}"
You recently visited and tested the website: {target_url}
During your test, your action history was: {thoughts}
Your final interaction outcome was: {status}

Please give your opening review of the website in the focus group. Focus on:
- What did you think of the website?
- What was the main reason you {status.lower()}?
- Be extremely authentic to your persona, demographic, and background.

Keep your response to 2-3 sentences. Do not use any AI meta-language. Talk in first person."""

        try:
            await asyncio.sleep(1)
            response = await generate_content_with_retry(model, prompt)
            message = response.text.strip()
            
            add_debate_message(simulation_id, agent_id, persona, message)
            print(f"\033[95m[{agent_id} ({status})]: {message}\033[0m")
            
            debate_history.append({"agent_id": agent_id, "persona": persona, "status": status, "message": message})
        except Exception as e:
            print(f"[Debate] Error generating opening statement for {agent_id}: {e}")
            
    # Round 2: Argument / Rebuttals
    for agent in participants:
        agent_id = agent["agent_id"]
        persona = agent["persona"]
        status = agent["final_status"]
        
        # Build discussion thread context
        thread_context = "\n".join([f"- {h['agent_id']} ({h['status']}): {h['message']}" for h in debate_history if h['agent_id'] != agent_id])
        
        prompt = f"""You are a customer representing this persona: "{persona}"
You are in a focus group debating your experience of the website: {target_url}

Other participants in the focus group said the following:
{thread_context}

Based on your persona and experience (your final outcome was {status}), respond to the other participants' opinions.
- Do you agree or disagree with their feedback? Why?
- Argue your point of view based on your specific needs (e.g. if you are price-sensitive, explain why their comments make sense/don't make sense to you; if you are an enterprise buyer, explain your logic vs a budget student).
- Keep it polite but make it a healthy, realistic debate.

Keep your response to 2-3 sentences. Speak in first person. Do not use AI meta-language."""

        try:
            await asyncio.sleep(1.5)
            response = await generate_content_with_retry(model, prompt)
            message = response.text.strip()
            
            add_debate_message(simulation_id, agent_id, persona, message)
            print(f"\033[95m[{agent_id} rebuttal]: {message}\033[0m")
            
            # Append to history so next agents can see the evolving discussion
            debate_history.append({"agent_id": agent_id, "persona": persona, "status": status, "message": message})
        except Exception as e:
            print(f"[Debate] Error generating rebuttal for {agent_id}: {e}")
            
    print("\033[95m[Debate] Focus group debate completed.\033[0m\n")


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
            agent_id, p_data = queue.get_nowait()
        except asyncio.QueueEmpty:
            break

        # Aggressively stagger start to avoid hitting RPM limit
        stagger_delay = random.uniform(5.0, 15.0)
        print(f"[Worker-{worker_id}] Staggering start (waiting {stagger_delay:.1f}s)...")
        await asyncio.sleep(stagger_delay)

        persona = p_data.get("persona", "")
        segment = p_data.get("segment", "General")

        try:
            result = await run_ghost_agent(agent_id, url, persona, logger, semaphore, max_steps=5, segment=segment)
            result["segment"] = segment
            results.append(result)
        except Exception as exc:
            print(f"[Worker-{worker_id}] Agent error: {exc}")
        finally:
            queue.task_done()


# ── AI Report Generator ───────────────────────────────────────────────────────
async def _generate_report(target_url: str, results: list[dict], simulation_id: int) -> str:
    print("\n\033[96m[Report] Generating AI Analyst Report...\033[0m")
    
    # Query database to see if we have conversions_count (hybrid projection mode)
    import sqlite3
    from database import DB_PATH
    
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        sim = conn.execute("SELECT * FROM simulations WHERE id = ?", (simulation_id,)).fetchone()
        
    conversions = sim["conversions_count"] if sim else None
    if conversions is not None:
        total = sim["num_agents"]
        bounced = sim["bounces_count"]
        timed_out = sim["timed_out_count"]
    else:
        total     = len(results)
        conversions = sum(1 for r in results if r["final_status"] == "CONVERTED")
        bounced   = sum(1 for r in results if r["final_status"] == "BOUNCED")
        timed_out = total - conversions - bounced

    lines = []
    for r in results:
        thoughts_str = " | ".join(r.get("thoughts", []))[:400]
        lines.append(f"- {r['agent_id']} ({r['final_status']}): {r['persona'][:80]}... → {thoughts_str}")

    # Fetch focus group debate transcripts from database
    debate_lines = []
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT agent_id, persona, message FROM simulation_debates WHERE simulation_id = ? ORDER BY id ASC",
                (simulation_id,)
            ).fetchall()
            for r in rows:
                debate_lines.append(f"[{r['agent_id']} ({r['persona'][:30]}...)]: \"{r['message']}\"")
    except Exception as e:
        print(f"[Report] Failed to query debate messages: {e}")

    debate_summary = "\n".join(debate_lines) if debate_lines else "No focus group debate was recorded."

    prompt = f"""You are a senior UX and CRO analyst. A synthetic swarm of {total} ghost consumers just tested: {target_url}

Overall Stats: {conversions} converted ({round(conversions/total*100,1) if total>0 else 0}%), {bounced} bounced, {timed_out} timed out.

Focus group debate transcripts:
{debate_summary}

Agent behavior summary (sample runs):
{chr(10).join(lines)}

Write a structured analytics report with these sections:
## Executive Summary
## Key Friction Points
## Top Performing Elements
## High-Risk Personas
## Priority Recommendations
## Predicted Real-World Impact

Be specific, data-driven, and actionable. Synthesize findings from both the individual browser runs and the focus group debate transcripts. No fluff."""

    response = await generate_content_with_retry(model, prompt)
    return response.text


# ── Large-Scale Cohort Projection ─────────────────────────────────────────────
async def _project_large_scale_outcomes(target_url: str, page_content: str, results: list[dict], num_ghosts: int) -> dict:
    print(f"\n\033[96m[Projection] Projecting outcomes for {num_ghosts} agents...\033[0m")
    
    sample_runs_summary = []
    for r in results:
        sample_runs_summary.append(f"- {r['agent_id']} ({r['final_status']}): {r['persona'][:100]}...")
    sample_summary = "\n".join(sample_runs_summary)

    prompt = f"""You are a CRO analytics engine.
We are simulating a user-testing swarm of {num_ghosts} agents on the website: {target_url}

Landing page text content:
\"\"\"
{page_content[:4000]}
\"\"\"

We ran a few real browser tests, which yielded these results:
{sample_summary}

Based on the landing page content, potential barriers (pricing, UX issues, jargon) and the sample runs, project the final outcome distribution for the entire swarm of {num_ghosts} agents.
Provide the estimated counts for:
- Converted (agents who would purchase or register)
- Bounced (agents who would leave the site)
- Timed Out (agents who would browse but not convert)
- Error (failed actions)

The sum of these 4 counts MUST be exactly {num_ghosts}.

Also, provide a list of 10 distinct and diverse customer personas (representing all age groups and segments) and a 2-sentence focus group review/argument statement for each about their experience on the site.

Return ONLY a valid JSON object in this format:
{{
  "conversions": 1234,
  "bounces": 5678,
  "timed_out": 90,
  "errors": 10,
  "personas": [
    {{
      "name": "Alex",
      "segment": "Skeptic / Edge",
      "persona": "You are Alex, a 42-year-old journalist...",
      "review": "I searched the page but couldn't find any pricing information. It felt untrustworthy so I bounced."
    }},
    ...
  ]
}}
Do not include markdown tags or surrounding text. Just output raw JSON."""

    try:
        response = await generate_content_with_retry(model, prompt)
        text = response.text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
        return json.loads(text)
    except Exception as e:
        print(f"[Projection] ⚠ Gemini projection failed: {e}. Using mathematical fallback.")
        converted = sum(1 for r in results if r["final_status"] == "CONVERTED")
        bounced = sum(1 for r in results if r["final_status"] == "BOUNCED")
        total_samples = len(results) if len(results) > 0 else 1
        
        c_ratio = converted / total_samples
        b_ratio = bounced / total_samples
        
        conversions = int(num_ghosts * c_ratio)
        bounces = int(num_ghosts * b_ratio)
        timed_out = num_ghosts - conversions - bounces
        
        # Build 10 default personas
        personas = []
        for i in range(10):
            bp = STATIC_PERSONAS_WITH_METADATA[i % len(STATIC_PERSONAS_WITH_METADATA)]
            personas.append({
                "name": bp["name"],
                "segment": bp["segment"],
                "persona": bp["persona"],
                "review": f"I had a {'good' if i%3==0 else 'challenging'} experience browsing the site."
            })
            
        return {
            "conversions": conversions,
            "bounces": bounces,
            "timed_out": timed_out,
            "errors": 0,
            "personas": personas
        }


# ── Main Swarm Orchestrator ───────────────────────────────────────────────────
async def run_swarm(target_url: str, num_ghosts: int = 5, simulation_id: Optional[int] = None):
    # Set worker bounds for hybrid simulation
    is_large_scale = num_ghosts > 10
    real_count = min(3, num_ghosts) if is_large_scale else num_ghosts
    
    max_workers, sem_limit, tier_name = _tier(real_count)

    print(f"\n\033[96m{'='*52}\033[0m")
    print(f"\033[96m  Ghost Swarm  |  {num_ghosts} agents  |  Tier: {tier_name} (Large-Scale: {is_large_scale})\033[0m")
    print(f"\033[96m  Workers: {max_workers}  |  Semaphore: {sem_limit}  |  Target: {target_url}\033[0m")
    print(f"\033[96m{'='*52}\033[0m\n")

    start_time = time.time()
    init_db()

    if simulation_id is None:
        simulation_id = create_simulation(target_url, num_ghosts)
    else:
        update_simulation_status(simulation_id, 'running')

    logger    = GhostLogger(simulation_id)
    semaphore = asyncio.Semaphore(sem_limit)

    # 1. Landing page analysis
    page_content = await _extract_landing_page_text(target_url)

    # 2. Generate dynamic personas for active workers
    pool = await _generate_dynamic_personas(target_url, page_content, real_count)

    # Fill the queue
    queue: asyncio.Queue = asyncio.Queue()
    for i, p_data in enumerate(pool):
        await queue.put((f"Ghost-{i+1}", p_data))

    results: list[dict] = []

    # Spawn workers
    workers = [
        asyncio.create_task(_worker(w, queue, target_url, logger, semaphore, results))
        for w in range(1, max_workers + 1)
    ]
    await asyncio.gather(*workers)

    # 3. Hybrid large-scale projection or focus group debate
    if is_large_scale:
        proj = await _project_large_scale_outcomes(target_url, page_content, results, num_ghosts)
        
        # Save projected counts
        save_projected_stats(simulation_id, proj["conversions"], proj["bounces"], proj["timed_out"], proj["errors"])
        
        # Register simulated sessions
        import sqlite3
        from database import DB_PATH
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            for idx, p in enumerate(proj["personas"]):
                agent_id = f"Ghost-Sim-{idx+1}"
                
                # Assign status based on projected conversion ratios
                if idx < int(10 * (proj["conversions"] / num_ghosts)):
                    status = "CONVERTED"
                elif idx < int(10 * ((proj["conversions"] + proj["bounces"]) / num_ghosts)):
                    status = "BOUNCED"
                else:
                    status = "TIMED_OUT"
                    
                cursor.execute(
                    "INSERT INTO agent_sessions (simulation_id, agent_id, persona, segment, final_status) VALUES (?, ?, ?, ?, ?)",
                    (simulation_id, agent_id, p["persona"], p["segment"], status)
                )
                sess_id = cursor.lastrowid
                
                # Mock step 1 (Read)
                cursor.execute(
                    """INSERT INTO agent_logs 
                       (session_id, step_number, thought_process, action, target, page_url, scroll_depth, action_success, duration_ms)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (sess_id, 1, f"Analyzing landing page copy and elements on {target_url}.", "READ", "", target_url, None, None, 1800)
                )
                # Mock step 2 (Outcome)
                if status == "CONVERTED":
                    cursor.execute(
                        """INSERT INTO agent_logs 
                           (session_id, step_number, thought_process, action, target, page_url, scroll_depth, action_success, duration_ms)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (sess_id, 2, "Everything matches my requirements. Clicking primary CTA to convert.", "BUY", "Purchase", target_url, 45, 1, 1200)
                    )
                elif status == "BOUNCED":
                    cursor.execute(
                        """INSERT INTO agent_logs 
                           (session_id, step_number, thought_process, action, target, page_url, scroll_depth, action_success, duration_ms)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (sess_id, 2, "I don't see a clear solution to my pain points. Bouncing.", "BOUNCE", "", target_url, 30, None, 800)
                    )
                else:
                    cursor.execute(
                        """INSERT INTO agent_logs 
                           (session_id, step_number, thought_process, action, target, page_url, scroll_depth, action_success, duration_ms)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (sess_id, 2, "Browsing around but unable to decide. Timed out.", "READ", "", target_url, 60, None, 2000)
                    )
            conn.commit()

        # Simulate live focus group debate and count up completed_agents live
        print(f"\n\033[96m[Debate] Generating debate transcript for {num_ghosts} agents...\033[0m")
        debate_prompt = f"""You are a focus group moderator.
A focus group panel of these personas just reviewed {target_url}:
{json.dumps(proj["personas"], indent=2)}

Generate a transcript of a 10-message debate/conversation where they discuss their opinions and argue about the site.
Make it flow like a real dialogue:
- Personas should reply to each other, counter arguments, and defend their views.
- Some should complain, some should praise, some should suggest improvements.
- Keep each message to 2-3 sentences. Speak in first person.

Return ONLY a valid JSON list in this format:
[
  {{
    "name": "Alex",
    "persona": "You are Alex...",
    "message": "I agree with Priya, but..."
  }},
  ...
]
Do not include markdown tags. Just output raw JSON list."""

        try:
            response = await generate_content_with_retry(model, debate_prompt)
            text = response.text.strip()
            if text.startswith("```json"):
                text = text[7:]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()
            debate_list = json.loads(text)
        except Exception as e:
            print(f"[Debate] ⚠ Failed to generate debate transcript: {e}. Using fallback.")
            debate_list = []
            for idx, p in enumerate(proj["personas"]):
                debate_list.append({
                    "name": p["name"],
                    "persona": p["persona"],
                    "message": p["review"]
                })

        step_increment = max(1, int((num_ghosts - real_count) / len(debate_list)))
        for idx, msg_data in enumerate(debate_list):
            agent_id = f"Ghost-Sim-{idx+1}"
            add_debate_message(simulation_id, agent_id, msg_data["persona"], msg_data["message"])
            print(f"[Debate Stream] {agent_id}: \"{msg_data['message'][:80]}...\"")
            
            current_completed = min(num_ghosts, real_count + (idx + 1) * step_increment)
            with sqlite3.connect(DB_PATH) as conn:
                conn.cursor().execute("UPDATE simulations SET completed_agents = ? WHERE id = ?", (current_completed, simulation_id))
            
            await asyncio.sleep(1.5)
            
    else:
        # Standard small-scale focus group debate
        try:
            await run_swarm_debate(simulation_id, target_url, results)
        except Exception as exc:
            print(f"[Swarm] ⚠ Focus group debate failed ({exc})")

    # Attempt AI Report
    try:
        report = await asyncio.wait_for(
            _generate_report_with_retry(target_url, results, simulation_id),
            timeout=180
        )
        save_report(simulation_id, report)
        print(f"[Swarm] AI report saved for SIM-{simulation_id}")
    except asyncio.TimeoutError:
        print(f"[Swarm] ⚠ Gemini report timed out after 180s — sim still marked completed")
    except Exception as exc:
        print(f"[Swarm] ⚠ Gemini report failed ({exc}) — sim still marked completed")

    # Always finalise the simulation row
    end_simulation(simulation_id)
    # Ensure completed_agents reaches exact num_ghosts
    with sqlite3.connect(DB_PATH) as conn:
        conn.cursor().execute("UPDATE simulations SET completed_agents = ? WHERE id = ?", (num_ghosts, simulation_id))

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
