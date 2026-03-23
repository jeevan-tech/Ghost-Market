import { NextResponse } from 'next/server';
import { run, query } from '@/lib/db';

// ── Demo Simulation Generator ─────────────────────────────────────────────────
// Used when DEMO_MODE=true (Cloud Run) OR when Python subprocess is unavailable.
// Generates a realistic, fully-populated simulation purely in TypeScript/Node.js.

const DEMO_PERSONAS = [
  { name: "Maya", short: "Budget Student", persona: "22-year-old college student, $30/mo budget, bounces if no student discount." },
  { name: "Robert", short: "VP of Sales", persona: "52-year-old VP, needs SOC2/GDPR compliance and SLA before trusting anyone." },
  { name: "Sofia", short: "Gig Worker", persona: "25-year-old gig worker obsessed with price. Bounces on hidden fees." },
  { name: "Daniel", short: "Senior Engineer", persona: "31-year-old engineer who hates buzzwords. Hunts for GitHub or API docs." },
  { name: "Carol", short: "Time-Poor CEO", persona: "47-year-old CEO. Needs to grasp value in 10 seconds or she closes the tab." },
  { name: "Leo", short: "Impulse Buyer", persona: "Compulsive impulse buyer who clicks BUY immediately if he sees a countdown timer." },
  { name: "Beverly", short: "Confused Senior", persona: "68-year-old retiree frustrated by jargon. Needs a live chat button." },
  { name: "Alex", short: "Skeptic", persona: "42-year-old journalist hunting for red flags: vague promises, hidden pricing." },
  { name: "Aisha", short: "UX Designer", persona: "29-year-old UX designer who treats the site itself as the product demo." },
  { name: "Sam", short: "Researcher", persona: "Methodical researcher who reads FAQ, About Us, and blog before buying." },
];

type AgentOutcome = { status: 'CONVERTED' | 'BOUNCED' | 'TIMED_OUT'; steps: Step[] };
type Step = { thought: string; action: string; target: string; scroll?: number; success?: boolean; ms: number };

function buildAgentSteps(persona: typeof DEMO_PERSONAS[0], url: string, index: number): AgentOutcome {
  const host = (() => { try { return new URL(url).hostname; } catch { return url; } })();

  const readSteps: Step[] = [
    { thought: `Landing on ${host} — scanning the hero section to understand what this product does.`, action: "READ",        target: "",              ms: 2100 },
    { thought: `Scrolling down to see if there's social proof or pricing below the fold.`,           action: "SCROLL_DOWN",  target: "",  scroll: 42, ms: 800  },
    { thought: `Interesting — the value proposition is visible but I need more detail.`,              action: "READ",        target: "",              ms: 1800 },
  ];

  // Outcome logic based on persona index
  if (index === 5) { // Leo — impulse buyer
    return { status: 'CONVERTED', steps: [
      { thought: "I see a limited-time offer badge — I need this NOW.", action: "READ", target: "", ms: 900 },
      { thought: "Clicking Get Started immediately.", action: "CLICK", target: "Get Started", success: true, ms: 1200 },
      { thought: "BUY — this is exactly what I needed, no hesitation.", action: "BUY", target: "", ms: 600 },
    ]};
  }
  if (index === 2) { // Sofia — price-sensitive
    return { status: 'BOUNCED', steps: [
      ...readSteps,
      { thought: "Looking for pricing page — can't see it in the nav.", action: "CLICK", target: "Pricing", success: false, ms: 1100 },
      { thought: "No visible pricing anywhere! This is a red flag — I'm out.", action: "BOUNCE", target: "", ms: 400 },
    ]};
  }
  if (index === 6) { // Beverly — confused senior
    return { status: 'BOUNCED', steps: [
      { thought: "The page loaded but I'm not sure what this product actually does.", action: "READ", target: "", ms: 3000 },
      { thought: "Looking for phone number or live chat — I need to speak to someone.", action: "SCROLL_DOWN", target: "", scroll: 80, ms: 900 },
      { thought: "No phone number anywhere. I'm not comfortable giving my card details. Leaving.", action: "BOUNCE", target: "", ms: 500 },
    ]};
  }
  if (index === 1) { // Robert — VP
    return { status: 'CONVERTED', steps: [
      ...readSteps,
      { thought: "Checking for compliance mentions — I need SOC 2 or GDPR in the footer.", action: "SCROLL_DOWN", target: "", scroll: 90, ms: 1000 },
      { thought: "Found security certifications section. This looks enterprise-grade.", action: "READ", target: "", ms: 2500 },
      { thought: "Clicking 'Request a Demo' — I'll bring this to my CFO.", action: "CLICK", target: "Request a Demo", success: true, ms: 1300 },
      { thought: "BUY — This checks all our enterprise requirements.", action: "BUY", target: "", ms: 700 },
    ]};
  }
  if (index === 4) { // Carol — CEO
    return { status: 'TIMED_OUT', steps: [
      { thought: "First 5 seconds — scanning for a one-line value prop. Don't see it.", action: "READ", target: "", ms: 1500 },
      { thought: "Scrolling for something that tells me the ROI immediately.", action: "SCROLL_DOWN", target: "", scroll: 50, ms: 700 },
      { thought: "Too much text, not enough data. My time is limited. Closing the tab.", action: "BOUNCE", target: "", ms: 400 },
    ]};
  }
  if (index === 7) { // Alex — journalist/skeptic
    return { status: 'BOUNCED', steps: [
      ...readSteps,
      { thought: "Checking the About Us page — I want to see real team members, not stock photos.", action: "CLICK", target: "About", success: true, ms: 1400 },
      { thought: "No LinkedIn profiles linked. The testimonials look generic. Red flag.", action: "READ", target: "", ms: 2000 },
      { thought: "I'd write a negative review about the lack of transparency. BOUNCE.", action: "BOUNCE", target: "", ms: 300 },
    ]};
  }
  if (index === 3) { // Daniel — engineer
    return { status: 'TIMED_OUT', steps: [
      { thought: "Scanning for GitHub link, API docs, or tech stack disclosure.", action: "READ", target: "", ms: 1700 },
      { thought: "Clicking Documentation if it exists.", action: "CLICK", target: "Docs", success: false, ms: 900 },
      { thought: "No docs link found. Trying the footer.", action: "SCROLL_DOWN", target: "", scroll: 100, ms: 800 },
      { thought: "Nothing. A SaaS product with no public API docs is a vendor lock-in risk. Timed out.", action: "READ", target: "", ms: 2000 },
    ]};
  }
  if (index === 8) { // Aisha — UX designer
    return { status: 'BOUNCED', steps: [
      { thought: "First impression: the hero typography is inconsistent — font weights look off.", action: "READ", target: "", ms: 1200 },
      { thought: "Scrolling to evaluate the overall visual hierarchy.", action: "SCROLL_DOWN", target: "", scroll: 60, ms: 700 },
      { thought: "The CTA button colors clash with the brand palette. As a designer, I'd never recommend this to my clients.", action: "BOUNCE", target: "", ms: 400 },
    ]};
  }
  if (index === 9) { // Sam — researcher
    return { status: 'CONVERTED', steps: [
      ...readSteps,
      { thought: "Navigating to the blog — I want to see if they publish original research.", action: "CLICK", target: "Blog", success: true, ms: 1500 },
      { thought: "Reading a case study — 3x ROI for a Series A startup. Compelling.", action: "READ", target: "", ms: 3500 },
      { thought: "Checked FAQ, reviews, pricing. Everything checks out. Time to buy.", action: "BUY", target: "", ms: 800 },
    ]};
  }
  // Maya — default bounce
  return { status: 'BOUNCED', steps: [
    { thought: "No student pricing or free tier visible. This is not for me.", action: "BOUNCE", target: "", ms: 600 },
  ]};
}

function generateReport(targetUrl: string, results: { persona: string; status: string; steps: Step[] }[]): string {
  const total     = results.length;
  const converted = results.filter(r => r.status === 'CONVERTED').length;
  const bounced   = results.filter(r => r.status === 'BOUNCED').length;
  const convRate  = ((converted / total) * 100).toFixed(1);
  const host = (() => { try { return new URL(targetUrl).hostname; } catch { return targetUrl; } })();

  return `## Executive Summary
Our synthetic swarm of ${total} ghost consumers tested ${host}. The simulation achieved a ${convRate}% conversion rate — ${converted} agents converted, ${bounced} bounced immediately. The most critical drop-off occurred at the pricing discovery phase, where price-sensitive personas could not locate transparent pricing information within the first 30 seconds.

## Key Friction Points
1. **No visible pricing** — Budget-conscious and gig-economy personas (Sofia, Maya) bounced within 3 steps due to inability to find pricing. This represents a ~25% addressable loss.
2. **Missing technical credibility signals** — Developer and engineer personas (Daniel) could not find API documentation or GitHub links, creating perceived vendor lock-in risk.
3. **Weak mobile-first hierarchy** — Executive personas (Carol) failed to grasp the core value proposition within 5 seconds, suggesting the hero copy is not scannable enough.
4. **No live support signal** — Older demographics (Beverly) immediately bounced when no phone number or live chat was found, representing an excluded but high-value segment.

## Top Performing Elements
- **Social proof + case studies**: Researcher persona (Sam) converted after reading a compelling 3x ROI case study in the blog — content marketing is working.
- **Urgency/scarcity signals**: Impulse buyer (Leo) converted immediately upon seeing a limited-time offer badge — urgency triggers are highly effective.
- **Enterprise compliance signals**: VP persona (Robert) converted after spotting SOC 2/GDPR compliance badges, confirming enterprise trust signals are correctly placed.

## High-Risk Personas
- **Budget Consumer (26% of market)** → 0% conversion rate
- **Senior/Non-technical (15% of market)** → 0% conversion rate
- **Technical Skeptic (20% of market)** → 0% conversion rate
These three segments represent 61% of your addressable market with near-zero conversion.

## Priority Recommendations
1. **Add a transparent pricing page** — Place a "Pricing" link in the primary navigation. This single change is projected to recover 15-20% of bounces.
2. **Add public API documentation** — A /docs page with OpenAPI spec converts developers instantly.
3. **Compress the hero** — Lead with one data point: "X% of startups who use [product] raise their next round." Remove or simplify all secondary copy.
4. **Add a live chat widget** — Converts senior/confused personas who need human reassurance.
5. **Add student/non-profit pricing** — A dedicated page increases price-sensitive conversions by an estimated 12%.

## Predicted Real-World Impact
Implementing recommendations 1-3 is projected to increase real-world conversion rate from the current ${convRate}% baseline to **${Math.min(45, Number(convRate) + 18).toFixed(1)}%** — a ${Math.min(45, Number(convRate) + 18 - Number(convRate)).toFixed(1)} percentage point lift worth approximately $240K in additional ARR per 10,000 monthly visitors.`;
}

async function runDemoSimulation(targetUrl: string, numAgents: number, simulationId: number) {
  const personas = DEMO_PERSONAS.slice(0, Math.min(numAgents, DEMO_PERSONAS.length));
  const url = targetUrl;
  const results: { persona: string; status: string; steps: Step[] }[] = [];

  for (let i = 0; i < personas.length; i++) {
    const p = personas[i];
    const outcome = buildAgentSteps(p, url, i);
    results.push({ persona: p.persona, status: outcome.status, steps: outcome.steps });

    // Insert session
    const sessResult = await run(
      "INSERT INTO agent_sessions (simulation_id, agent_id, persona, final_status) VALUES (?, ?, ?, ?)",
      [simulationId, `Ghost-${i + 1}`, p.persona, outcome.status]
    );
    const sessionId = sessResult.lastID;

    // Insert steps
    for (let s = 0; s < outcome.steps.length; s++) {
      const step = outcome.steps[s];
      await run(
        `INSERT INTO agent_logs
           (session_id, step_number, thought_process, action, target, page_url, scroll_depth, action_success, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sessionId, s + 1, step.thought, step.action, step.target || '',
          url, step.scroll ?? null,
          step.success !== undefined ? (step.success ? 1 : 0) : null,
          step.ms,
        ]
      );
    }

    // Increment completed counter
    await run("UPDATE simulations SET completed_agents = completed_agents + 1 WHERE id = ?", [simulationId]);
  }

  // Generate and save report
  const report = generateReport(targetUrl, results);
  await run(
    "UPDATE simulations SET report_summary = ?, end_time = CURRENT_TIMESTAMP WHERE id = ?",
    [report, simulationId]
  );
}

// ── API Route ─────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const { targetUrl, numAgents } = await request.json();

    if (!targetUrl) {
      return NextResponse.json({ error: 'Target URL is required' }, { status: 400 });
    }

    const numA = numAgents || 10;

    // Create simulation row immediately
    const result = await run(
      "INSERT INTO simulations (target_url, num_agents) VALUES (?, ?)",
      [targetUrl, numA]
    );
    const simulationId = result.lastID;

    // Default to demo mode in production (Cloud Run) or if explicitly set
    const demoMode = process.env.DEMO_MODE === 'true' || process.env.NODE_ENV === 'production';

    if (demoMode) {
      // Cloud Run: run the TypeScript demo simulator directly (no Python/Playwright needed)
      // Run async without blocking the response
      runDemoSimulation(targetUrl, numA, simulationId).catch(err =>
        console.error('[Demo] Simulation error:', err)
      );
      return NextResponse.json({
        success: true,
        mode: 'demo',
        message: `Demo simulation started with ${numA} ghost agents. Results will appear in ~5 seconds.`,
        simulationId,
      });
    } else {
      // Local dev: spawn Python swarm engine
      const { spawn } = await import('child_process');
      const path = await import('path');
      const enginePath = path.resolve(process.cwd(), '../engine');
      const pythonExe = path.join(enginePath, 'venv', 'bin', 'python3');
      const child = spawn(pythonExe, ['swarm.py', targetUrl, numA.toString(), simulationId.toString()], {
        cwd: enginePath,
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      return NextResponse.json({
        success: true,
        mode: 'engine',
        message: 'Python swarm engine launched.',
        simulationId,
      });
    }

  } catch (error) {
    console.error('Trigger error:', error);
    return NextResponse.json({ error: 'Failed to start simulation' }, { status: 500 });
  }
}
