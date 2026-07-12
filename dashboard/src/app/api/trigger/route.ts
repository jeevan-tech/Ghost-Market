import { NextResponse } from 'next/server';
import { run, query } from '@/lib/db';

// ── Demo Simulation Generator ─────────────────────────────────────────────────
// Used when DEMO_MODE=true (Cloud Run) OR when Python subprocess is unavailable.
// Generates a realistic, fully-populated simulation purely in TypeScript/Node.js.

const DEMO_PERSONAS = [
  { name: "Maya", segment: "Budget / Young", short: "Budget Student", persona: "22-year-old college student, $30/mo budget, bounces if no student discount." },
  { name: "Robert", segment: "Executive", short: "VP of Sales", persona: "52-year-old VP, needs SOC2/GDPR compliance and SLA before trusting anyone." },
  { name: "Sofia", segment: "Budget / Young", short: "Gig Worker", persona: "25-year-old gig worker obsessed with price. Bounces on hidden fees." },
  { name: "Daniel", segment: "Mid-Career Pro", short: "Senior Engineer", persona: "31-year-old engineer who hates buzzwords. Hunts for GitHub or API docs." },
  { name: "Carol", segment: "Executive", short: "Time-Poor CEO", persona: "47-year-old CEO. Needs to grasp value in 10 seconds or she closes the tab." },
  { name: "Leo", segment: "Niche / Specialist", short: "Impulse Buyer", persona: "Compulsive impulse buyer who clicks BUY immediately if he sees a countdown timer." },
  { name: "Beverly", segment: "Niche / Specialist", short: "Confused Senior", persona: "68-year-old retiree frustrated by jargon. Needs a live chat button." },
  { name: "Alex", segment: "Skeptic / Edge", short: "Skeptic", persona: "42-year-old journalist hunting for red flags: vague promises, hidden pricing." },
  { name: "Aisha", segment: "Mid-Career Pro", short: "UX Designer", persona: "29-year-old UX designer who treats the site itself as the product demo." },
  { name: "Sam", segment: "Niche / Specialist", short: "Researcher", persona: "Methodical researcher who reads FAQ, About Us, and blog before buying." },
];

type AgentOutcome = { status: 'CONVERTED' | 'BOUNCED' | 'TIMED_OUT'; steps: Step[] };
type Step = { thought: string; action: string; target: string; scroll?: number; success?: boolean; ms: number };

function getDynamicSegment(url: string, staticSegment: string): string {
  const host = url.toLowerCase().includes('stripe') ? 'stripe' : url.toLowerCase().includes('vercel') ? 'vercel' : 'generic';
  
  if (host === 'stripe') {
    if (staticSegment === 'Budget / Young') return 'Startup Founders';
    if (staticSegment === 'Mid-Career Pro') return 'Integration Engineers';
    if (staticSegment === 'Executive') return 'Finance Officers';
    if (staticSegment === 'Niche / Specialist') return 'SaaS Platforms';
    return 'Security & Compliance';
  }
  
  if (host === 'vercel') {
    if (staticSegment === 'Budget / Young') return 'Indie Developers';
    if (staticSegment === 'Mid-Career Pro') return 'Frontend Engineers';
    if (staticSegment === 'Executive') return 'Engineering Directors';
    if (staticSegment === 'Niche / Specialist') return 'Digital Agencies';
    return 'System Architects';
  }

  // Generic Dynamic Segments based on the site domain
  let domainLabel = 'Consumers';
  try {
    const domain = new URL(url).hostname.replace('www.', '').split('.')[0];
    domainLabel = domain.charAt(0).toUpperCase() + domain.slice(1);
  } catch (e) {}

  if (staticSegment === 'Budget / Young') return `Price-Sensitive ${domainLabel} Users`;
  if (staticSegment === 'Mid-Career Pro') return `Technical Professionals`;
  if (staticSegment === 'Executive') return `Business Decision Makers`;
  if (staticSegment === 'Niche / Specialist') return `Specialist Researchers`;
  return `Edge Skeptics`;
}

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

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not set");
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    })
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errText}`);
  }
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function generateReport(targetUrl: string, results: { persona: string; status: string; steps: Step[] }[]): string {
  const total     = results.length;
  const converted = results.filter(r => r.status === 'CONVERTED').length;
  const bounced   = results.filter(r => r.status === 'BOUNCED').length;
  const convRate  = ((converted / total) * 100).toFixed(1);
  const host = (() => { try { return new URL(targetUrl).hostname; } catch { return targetUrl; } })();

  return `## Executive Summary
Our synthetic swarm of ${total} ghost consumers tested ${host}. The simulation achieved a ${convRate}% conversion rate — ${converted} agents converted, ${bounced} bounced immediately.

## Key Friction Points
1. **No visible pricing** — Price-sensitive personas bounced within 2 steps due to inability to find flat-rate pricing.
2. **Missing technical credibility signals** — Developer personas could not find API documentation or GitHub links.
3. **Weak mobile-first hierarchy** — Executive personas failed to grasp the core value proposition within 5 seconds.

## Priority Recommendations
1. **Add a transparent pricing page** — Place a "Pricing" link in the primary navigation.
2. **Add public API documentation** — A /docs page with code samples converts developers instantly.
3. **Compress the hero** — Lead with a single, compelling data-driven headline.`;
}

async function runDemoSimulation(targetUrl: string, numAgents: number, simulationId: number) {
  const isLargeScale = numAgents > 3;
  const url = targetUrl;
  const host = (() => { try { return new URL(targetUrl).hostname; } catch { return targetUrl; } })();

  let personasList: { name: string; segment: string; short: string; persona: string }[] = [];
  let conversionsCount = 0;
  let bouncesCount = 0;
  let timedOutCount = 0;
  let individualOutcomes: { name: string; status: 'CONVERTED' | 'BOUNCED' | 'TIMED_OUT'; steps: { thought: string; action: string; target: string }[] }[] = [];
  let debateMessages: { name: string; message: string }[] = [];
  let reportText = "";

  // Step 1: Call Gemini to generate custom, site-specific personas
  try {
    const prompt1 = `You are a professional UX Research Director.
We are simulating a user-testing swarm on the website: ${targetUrl}.

Generate a list of 10 distinct, highly realistic customer personas (representing different age groups, occupations, and mentalities) who would naturally visit this website.
Ensure the personas are diverse and represent a balanced mix across these segments:
- "Budget / Young" (price-sensitive, students, gig workers)
- "Mid-Career Pro" (business professional, developers, marketers, designers, ROI-focused)
- "Executive" (decision-makers, CEOs, VPs, CTOs, compliance/SLA-focused)
- "Niche / Specialist" (seniors, shopify owners, non-profits, researchers)
- "Skeptic / Edge" (critics, competitor analysts, privacy advocates, security researchers)

Return ONLY a valid JSON array of 10 objects:
[
  {
    "name": "Name",
    "segment": "Segment name",
    "short": "Short job title/archetype",
    "persona": "Detailed description: You are <Name>, a <Age>-year-old <Job> who..."
  }
]
Do not include markdown wrappers or code blocks. Just output raw JSON.`;

    const rawPersonas = await callGemini(prompt1);
    personasList = JSON.parse(rawPersonas);
  } catch (err) {
    console.warn("[Demo] Gemini persona generation failed, using default fallback:", err);
    personasList = DEMO_PERSONAS.map(p => ({
      name: p.name,
      segment: getDynamicSegment(targetUrl, p.segment),
      short: p.short,
      persona: p.persona
    }));
  }

  // Step 2: Call Gemini to project outcomes, step logs, debate, and consolidated report
  try {
    const prompt2 = `You are a CRO Simulator.
We are simulating a user-testing swarm of ${numAgents} agents on the website: ${targetUrl}.

Here are the 10 custom customer personas visiting this site:
${JSON.stringify(personasList, null, 2)}

Project the final behavior and outcome distribution for the entire swarm of ${numAgents} agents.
Provide the estimated counts for:
- Converted (agents who purchase or register)
- Bounced (agents who leave immediately)
- Timed Out (agents who browse but do not convert)

The sum of these 3 counts must be exactly ${numAgents}.

Also, for the 10 representative personas listed above, determine their final status (CONVERTED, BOUNCED, or TIMED_OUT) and generate a step-by-step browsing log (2 steps each) describing their thoughts and actions (READ, CLICK, SCROLL_DOWN, BOUNCE, BUY) on the site.

Also, generate a transcript of a 10-message debate/conversation where these personas discuss and argue about the website. Personas should reply to each other, counter arguments, complain about usability/pricing, and defend their views in first person.

Also, generate a comprehensive consolidated CRO analyst report summarizing key friction points, top performing elements, high-risk personas, and priority recommendations.

Return ONLY a valid JSON object in this format:
{
  "conversions": 12,
  "bounces": 80,
  "timed_out": 8,
  "outcomes": [
    {
      "name": "Name",
      "status": "CONVERTED",
      "steps": [
        {
          "thought": "...",
          "action": "READ",
          "target": ""
        },
        {
          "thought": "...",
          "action": "BUY",
          "target": ""
        }
      ]
    }
  ],
  "debate": [
    {
      "name": "Name",
      "message": "..."
    }
  ],
  "report": "## Executive Summary\\n... (markdown content)"
}
Do not include markdown wrappers or code blocks. Just output raw JSON.`;

    const rawSim = await callGemini(prompt2);
    const simResult = JSON.parse(rawSim);

    conversionsCount = simResult.conversions || 0;
    bouncesCount = simResult.bounces || 0;
    timedOutCount = simResult.timed_out || 0;
    individualOutcomes = simResult.outcomes || [];
    debateMessages = simResult.debate || [];
    reportText = simResult.report || "";
  } catch (err) {
    console.warn("[Demo] Gemini simulation run failed, using default fallback:", err);
    // Mathematical fallback
    conversionsCount = Math.floor(numAgents * 0.3);
    bouncesCount = Math.floor(numAgents * 0.5);
    timedOutCount = numAgents - conversionsCount - bouncesCount;

    // Build default outcomes
    individualOutcomes = personasList.map((p, idx) => {
      const status = idx % 2 === 0 ? "BOUNCED" : (idx % 3 === 0 ? "TIMED_OUT" : "CONVERTED");
      return {
        name: p.name,
        status,
        steps: [
          { thought: `Landing on ${host} — checking for page elements.`, action: "READ", target: "" },
          { thought: `Action resolution: ${status}`, action: status === "CONVERTED" ? "BUY" : (status === "BOUNCED" ? "BOUNCE" : "READ"), target: "" }
        ]
      };
    });

    // Build default debate
    debateMessages = personasList.slice(0, 5).map(p => ({
      name: p.name,
      message: `I visited ${host}. It was okay, but I ended up ${p.name === 'Robert' ? 'converting' : 'bouncing'}.`
    }));

    // Build default report
    const dummyResults = individualOutcomes.map(o => ({
      persona: o.name,
      status: o.status,
      steps: o.steps.map(s => ({ thought: s.thought, action: s.action, target: s.target, ms: 1000 }))
    }));
    reportText = generateReport(targetUrl, dummyResults);
  }

  // Ensure counts sum up to numAgents
  if (conversionsCount + bouncesCount + timedOutCount !== numAgents) {
    timedOutCount = numAgents - conversionsCount - bouncesCount;
  }

  // Update simulations table with projected counts
  await run(
    `UPDATE simulations 
     SET conversions_count = ?, bounces_count = ?, timed_out_count = ?, errors_count = 0
     WHERE id = ?`,
    [conversionsCount, bouncesCount, timedOutCount, simulationId]
  );

  // Write all 10 custom sessions and steps to database
  const sessionIdsMap = new Map<string, number>();
  const sessionPersonasMap = new Map<string, string>();
  for (let i = 0; i < personasList.length; i++) {
    const p = personasList[i];
    const outcome = individualOutcomes.find(o => o.name === p.name) || {
      status: i % 2 === 0 ? "BOUNCED" : "CONVERTED",
      steps: [
        { thought: `Browsing ${host}.`, action: "READ", target: "" },
        { thought: `Resolving action.`, action: i % 2 === 0 ? "BOUNCE" : "BUY", target: "" }
      ]
    };

    const sessResult = await run(
      "INSERT INTO agent_sessions (simulation_id, agent_id, persona, segment, final_status) VALUES (?, ?, ?, ?, ?)",
      [simulationId, `Ghost-${i + 1}`, p.persona, p.segment, outcome.status]
    );
    const sessionId = sessResult.lastID;
    sessionIdsMap.set(p.name, sessionId);
    sessionPersonasMap.set(p.name, p.persona);

    // Insert steps
    for (let s = 0; s < outcome.steps.length; s++) {
      const step = outcome.steps[s];
      await run(
        `INSERT INTO agent_logs
           (session_id, step_number, thought_process, action, target, page_url, scroll_depth, action_success, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sessionId, s + 1, step.thought, step.action, step.target || '',
          url, null, null, 1000
        ]
      );
    }
  }

  // Stream debate and update completed_agents count in real time
  const stepIncrement = isLargeScale ? Math.max(1, Math.floor((numAgents - 3) / debateMessages.length)) : 1;
  for (let idx = 0; idx < debateMessages.length; idx++) {
    const msg = debateMessages[idx];
    const sessionId = sessionIdsMap.get(msg.name) || 0;
    const personaText = sessionPersonasMap.get(msg.name) || msg.name;

    await run(
      "INSERT INTO simulation_debates (simulation_id, agent_id, persona, message) VALUES (?, ?, ?, ?)",
      [simulationId, `Ghost-${idx + 1}`, personaText, msg.message]
    );

    if (isLargeScale) {
      const currentCompleted = Math.min(numAgents, 3 + (idx + 1) * stepIncrement);
      await run("UPDATE simulations SET completed_agents = ? WHERE id = ?", [currentCompleted, simulationId]);
      await new Promise(resolve => setTimeout(resolve, 800)); // sleep to simulate stream
    }
  }

  // Update report summary and finish simulation
  await run(
    "UPDATE simulations SET report_summary = ?, completed_agents = ?, end_time = CURRENT_TIMESTAMP WHERE id = ?",
    [reportText, numAgents, simulationId]
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
    const demoMode = process.env.DEMO_MODE === 'true' || (process.env.NODE_ENV === 'production' && process.env.DEMO_MODE !== 'false');

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
