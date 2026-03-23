/**
 * Pure TypeScript in-memory store — zero native dependencies.
 * Replaces sqlite3 entirely for Cloud Run deployment.
 * Data persists for the lifetime of the container instance (~hours in demo use).
 * Pre-seeded with 2 sample simulations so the dashboard is never empty.
 */

type Row = Record<string, any>;

// ── In-memory tables ──────────────────────────────────────────────────────────
const T = {
  simulations:    [] as Row[],
  agent_sessions: [] as Row[],
  agent_logs:     [] as Row[],
  nextId: { simulations: 1, agent_sessions: 1, agent_logs: 1 },
};

// ── Seed helpers ──────────────────────────────────────────────────────────────
function ts(offsetSec = 0) {
  return new Date(Date.now() - offsetSec * 1000).toISOString();
}
function addSim(url: string, numAgents: number, completed: number, start: string, end: string | null, report: string | null): number {
  const id = T.nextId.simulations++;
  T.simulations.push({ id, target_url: url, num_agents: numAgents, completed_agents: completed, start_time: start, end_time: end, report_summary: report });
  return id;
}
function addSession(simId: number, agentId: string, persona: string, status: string): number {
  const id = T.nextId.agent_sessions++;
  T.agent_sessions.push({ id, simulation_id: simId, agent_id: agentId, persona, final_status: status });
  return id;
}
function addLog(sessionId: number, step: number, thought: string, action: string, target: string, url: string, scroll: number | null, success: number | null, ms: number) {
  const id = T.nextId.agent_logs++;
  T.agent_logs.push({ id, session_id: sessionId, step_number: step, thought_process: thought, action, target, page_url: url, scroll_depth: scroll, action_success: success, duration_ms: ms, timestamp: ts() });
}

// ── Pre-seed: 2 completed demo simulations ────────────────────────────────────
const sim1 = addSim("https://stripe.com", 10, 10, ts(900), ts(780),
`## Executive Summary
Our swarm of 10 ghost consumers tested stripe.com. Conversion rate: 30.0% — 3 converted, 7 bounced or timed out. The platform excels at enterprise trust signals but loses price-sensitive and senior demographics.

## Key Friction Points
1. **Pricing complexity** — gig-worker and student personas bounced on seeing tiered enterprise pricing.
2. **Too much technical copy** — senior personas were overwhelmed by API-first messaging.
3. **No urgency signals** — impulse buyers had nothing to trigger immediate action.

## Top Performing Elements
- SOC2/GDPR badges immediately converted the VP of Sales persona.
- Comprehensive documentation converted the methodical researcher.
- Brand credibility (used by millions) converted the impulse buyer.

## Priority Recommendations
1. Add a "Start for free" CTA above the fold.
2. Create a non-technical landing page for SMB owners.
3. Add a live chat widget for confused or senior users.

## Predicted Real-World Impact
Top 3 changes projected to lift conversion from 30% to 48% — ~$240K ARR per 10K monthly visitors.`);

const s1 = addSession(sim1, "Ghost-1", "22yo student, $30/mo budget, bounces without student pricing", "BOUNCED");
addLog(s1,1,"Landing on stripe.com — scanning for student pricing or free tier.","READ","",  "https://stripe.com",null,null,2100);
addLog(s1,2,"No student tier visible. Enterprise pricing is way out of my budget.","BOUNCE","","https://stripe.com",null,null,500);

const s2 = addSession(sim1, "Ghost-2", "52yo VP needing SOC2/GDPR compliance before trusting anyone", "CONVERTED");
addLog(s2,1,"Checking the hero for a clear value proposition.","READ","","https://stripe.com",null,null,1800);
addLog(s2,2,"Scrolling to find compliance and security badges.","SCROLL_DOWN","","https://stripe.com",85,null,900);
addLog(s2,3,"Found SOC2, GDPR, PCI-DSS. This is enterprise-grade.","READ","","https://stripe.com",null,null,2200);
addLog(s2,4,"Clicking 'Contact Sales' to bring this to my CFO.","CLICK","Contact Sales","https://stripe.com",null,1,1300);
addLog(s2,5,"All enterprise requirements met. Proceeding to buy.","BUY","","https://stripe.com",null,null,700);

const s3 = addSession(sim1, "Ghost-3", "25yo gig worker obsessed with price, bounces on hidden fees", "BOUNCED");
addLog(s3,1,"Looking for the Pricing link in the navigation.","CLICK","Pricing","https://stripe.com",null,1,1100);
addLog(s3,2,"Pricing is complex and enterprise-focused. This is too expensive for me.","BOUNCE","","https://stripe.com/pricing",null,null,400);

const s4 = addSession(sim1, "Ghost-4", "31yo engineer hunting for GitHub link or API docs", "CONVERTED");
addLog(s4,1,"Scanning for GitHub repo or API documentation link.","READ","","https://stripe.com",null,null,1700);
addLog(s4,2,"Found the Developers section — clicking Docs.","CLICK","Docs","https://stripe.com",null,1,900);
addLog(s4,3,"Excellent API documentation with OpenAPI spec. Very impressive.","READ","","https://stripe.com/docs",null,null,3500);
addLog(s4,4,"Well-documented APIs, no vendor lock-in risk. I recommend this.","BUY","","https://stripe.com/docs",null,null,800);

const s5 = addSession(sim1, "Ghost-5", "47yo CEO needs value in 10 seconds or closes the tab", "BOUNCED");
addLog(s5,1,"Quick scan of the hero — looking for a one-line ROI statement.","READ","","https://stripe.com",null,null,1500);
addLog(s5,2,"Scrolling for a summary stat or customer logo.","SCROLL_DOWN","","https://stripe.com",50,null,700);
addLog(s5,3,"Too much text, not enough data. My time is too valuable. Closing.","BOUNCE","","https://stripe.com",null,null,400);

const s6 = addSession(sim1, "Ghost-6", "Impulse buyer, clicks BUY immediately on urgency badges", "CONVERTED");
addLog(s6,1,"Stripe's brand credibility is undeniable — millions of businesses use this.","READ","","https://stripe.com",null,null,900);
addLog(s6,2,"Clicking 'Start now' — I trust this brand completely.","CLICK","Start now","https://stripe.com",null,1,1200);
addLog(s6,3,"Bought immediately — no hesitation needed for Stripe.","BUY","","https://stripe.com",null,null,600);

const s7 = addSession(sim1, "Ghost-7", "68yo retiree frustrated by jargon, needs live chat", "BOUNCED");
addLog(s7,1,"The page is very technical — I do not understand what Stripe does.","READ","","https://stripe.com",null,null,3000);
addLog(s7,2,"Scrolling to find a phone number or live chat button.","SCROLL_DOWN","","https://stripe.com",80,null,900);
addLog(s7,3,"This is all developer jargon. I cannot trust this without speaking to someone.","BOUNCE","","https://stripe.com",null,null,500);

const s8 = addSession(sim1, "Ghost-8", "Journalist hunting for red flags: vague claims, hidden fees", "BOUNCED");
addLog(s8,1,"Clicking About to check if real team members are listed.","CLICK","About","https://stripe.com",null,1,1400);
addLog(s8,2,"Actually Stripe is a well-known legitimate company. But pricing is complex.","READ","","https://stripe.com/about",null,null,2000);
addLog(s8,3,"The transaction fee model has many edge cases. I would note this in my review.","BOUNCE","","https://stripe.com/pricing",null,null,300);

const s9 = addSession(sim1, "Ghost-9", "UX designer who judges site aesthetics as product demo", "BOUNCED");
addLog(s9,1,"First impression: very clean design, consistent typography — impressive.","READ","","https://stripe.com",null,null,1200);
addLog(s9,2,"Scrolling to evaluate visual hierarchy and micro-interactions.","SCROLL_DOWN","","https://stripe.com",60,null,700);
addLog(s9,3,"The interactive code demo is beautiful but the pricing page feels cluttered.","BOUNCE","","https://stripe.com/pricing",null,null,400);

const s10 = addSession(sim1, "Ghost-10", "Methodical researcher who reads FAQ, blog, reviews before buying", "CONVERTED");
addLog(s10,1,"Navigating to the blog for technical depth and case studies.","CLICK","Blog","https://stripe.com",null,1,1500);
addLog(s10,2,"Reading a case study showing 40% faster checkout for an e-commerce brand.","READ","","https://stripe.com/blog",null,null,3500);
addLog(s10,3,"FAQ, documentation, and reviews all check out. Very confident purchase.","BUY","","https://stripe.com/docs",null,null,800);

// Sim 2 — another demo
const sim2 = addSim("https://vercel.com", 10, 10, ts(3600), ts(3480),
`## Executive Summary
Swarm of 10 consumers tested vercel.com. Conversion: 40% (4 converted, 6 bounced). Vercel's developer experience is exceptional but pricing confuses non-technical decision-makers.

## Key Friction Points
1. **Developer-first messaging** alienates non-technical buyers (VP, CEO, senior users).
2. **No ROI framing** — executives need business value, not deployment metrics.
3. **Enterprise pricing opacity** — pricing page requires a sales call rather than showing numbers.

## Priority Recommendations
1. Add a "Business Value" landing page alongside the technical docs page.
2. Show concrete ROI stats in the hero (e.g. "Ship 3x faster, cut infrastructure costs by 40%").
3. Add a transparent enterprise pricing tier to reduce friction for large teams.`);

const vs1 = addSession(sim2,"Ghost-1","22yo student","CONVERTED");
addLog(vs1,1,"Vercel has a free Hobby tier! This is perfect for my projects.","READ","","https://vercel.com",null,null,1800);
addLog(vs1,2,"Clicking 'Start Deploying' on the free plan.","CLICK","Start Deploying","https://vercel.com",null,1,1100);
addLog(vs1,3,"Free tier with generous limits — buying immediately.","BUY","","https://vercel.com",null,null,600);

const vs2 = addSession(sim2,"Ghost-2","52yo VP needs compliance","BOUNCED");
addLog(vs2,1,"Checking for SOC2/GDPR compliance information.","READ","","https://vercel.com",null,null,1800);
addLog(vs2,2,"Security page exists but requires contacting sales for enterprise details.","SCROLL_DOWN","","https://vercel.com/security",85,null,900);
addLog(vs2,3,"Cannot get compliance details without a sales call. Too much friction.","BOUNCE","","https://vercel.com/enterprise",null,null,500);

const vs3 = addSession(sim2,"Ghost-3","25yo gig worker","CONVERTED");
addLog(vs3,1,"Free tier and $20/mo Pro plan are clearly visible. This is affordable!","READ","","https://vercel.com/pricing",null,null,1600);
addLog(vs3,2,"Signing up for Pro plan immediately.","BUY","","https://vercel.com/pricing",null,null,700);

const vs4 = addSession(sim2,"Ghost-4","31yo engineer","CONVERTED");
addLog(vs4,1,"Looking for GitHub integration and CI/CD documentation.","READ","","https://vercel.com",null,null,1500);
addLog(vs4,2,"Excellent git-based workflow, automatic preview deployments. Chef's kiss.","CLICK","Docs","https://vercel.com",null,1,1200);
addLog(vs4,3,"Zero-config deployments with edge network. Best DX I have seen. Buying.","BUY","","https://vercel.com/docs",null,null,600);

const vs5 = addSession(sim2,"Ghost-5","47yo CEO","BOUNCED");
addLog(vs5,1,"What does Vercel actually do for my business bottom line?","READ","","https://vercel.com",null,null,1500);
addLog(vs5,2,"I see technical benefits but no business ROI metrics. Closing.","BOUNCE","","https://vercel.com",null,null,400);

const vs6 = addSession(sim2,"Ghost-6","Impulse buyer","BOUNCED");
addLog(vs6,1,"No countdown timer or scarcity badge. Nothing to trigger urgency.","READ","","https://vercel.com",null,null,900);
addLog(vs6,2,"The free plan is good but I am not compelled to upgrade right now.","BOUNCE","","https://vercel.com",null,null,500);

const vs7 = addSession(sim2,"Ghost-7","68yo retiree","BOUNCED");
addLog(vs7,1,"I do not understand what deployment or hosting means. Very confusing.","READ","","https://vercel.com",null,null,3000);
addLog(vs7,2,"Looking for a phone number — I need to speak to a human.","SCROLL_DOWN","","https://vercel.com",80,null,900);
addLog(vs7,3,"No contact options for non-technical users. Leaving.","BOUNCE","","https://vercel.com",null,null,500);

const vs8 = addSession(sim2,"Ghost-8","Journalist/skeptic","BOUNCED");
addLog(vs8,1,"Checking if pricing is transparent or gated behind sales.","CLICK","Pricing","https://vercel.com",null,1,1200);
addLog(vs8,2,"Enterprise pricing requires contacting sales. This is a yellow flag.","BOUNCE","","https://vercel.com/pricing",null,null,400);

const vs9 = addSession(sim2,"Ghost-9","UX designer","CONVERTED");
addLog(vs9,1,"The design is absolutely beautiful — clean, modern, premium aesthetic.","READ","","https://vercel.com",null,null,1200);
addLog(vs9,2,"I would proudly show Vercel to any client. The micro-animations are superb.","SCROLL_DOWN","","https://vercel.com",60,null,700);
addLog(vs9,3,"This site IS the product demo. Converted immediately.","BUY","","https://vercel.com",null,null,400);

const vs10 = addSession(sim2,"Ghost-10","Methodical researcher","BOUNCED");
addLog(vs10,1,"Reading case studies and blog posts.","CLICK","Blog","https://vercel.com",null,1,1500);
addLog(vs10,2,"Case studies are developer-focused, not business-outcome-focused.","READ","","https://vercel.com/blog",null,null,3000);
addLog(vs10,3,"I need to see customer ROI data before recommending this to my team.","BOUNCE","","https://vercel.com/customers",null,null,500);


// ── SQL-driven run() / query() ────────────────────────────────────────────────

export async function run(sql: string, params: any[] = []): Promise<{ lastID: number }> {
  const s = sql.trim().toLowerCase().replace(/\s+/g, ' ');

  if (s.startsWith('insert into simulations')) {
    const id = T.nextId.simulations++;
    T.simulations.push({ id, target_url: params[0], num_agents: params[1], completed_agents: 0, start_time: ts(), end_time: null, report_summary: null });
    return { lastID: id };
  }

  if (s.startsWith('insert into agent_sessions')) {
    const id = T.nextId.agent_sessions++;
    T.agent_sessions.push({ id, simulation_id: params[0], agent_id: params[1], persona: params[2], final_status: params[3] });
    return { lastID: id };
  }

  if (s.startsWith('insert into agent_logs')) {
    const id = T.nextId.agent_logs++;
    const [session_id, step_number, thought_process, action, target, page_url, scroll_depth, action_success, duration_ms] = params;
    T.agent_logs.push({ id, session_id, step_number, thought_process, action, target, page_url, scroll_depth, action_success, duration_ms, timestamp: ts() });
    return { lastID: id };
  }

  if (s.includes('completed_agents') && s.includes('+')) {
    const sim = T.simulations.find(r => r.id === params[0]);
    if (sim) sim.completed_agents = (sim.completed_agents || 0) + 1;
    return { lastID: 0 };
  }

  if (s.includes('report_summary') && s.includes('update simulations')) {
    const sim = T.simulations.find(r => r.id === params[1]);
    if (sim) { sim.report_summary = params[0]; sim.end_time = ts(); }
    return { lastID: 0 };
  }

  if (s.includes('update simulations') && s.includes('end_time')) {
    const sim = T.simulations.find(r => r.id === params[0]);
    if (sim) sim.end_time = ts();
    return { lastID: 0 };
  }

  if (s.includes('update agent_sessions') && s.includes('final_status')) {
    const sess = T.agent_sessions.find(r => r.id === params[1]);
    if (sess) sess.final_status = params[0];
    return { lastID: 0 };
  }

  return { lastID: 0 };
}

export async function query(sql: string, params: any[] = []): Promise<Row[]> {
  const s = sql.trim().toLowerCase().replace(/\s+/g, ' ');

  // SELECT completed_agents, num_agents FROM simulations WHERE id = ?
  if (s.includes('completed_agents') && s.includes('num_agents') && s.includes('from simulations') && s.includes('where id =')) {
    const sim = T.simulations.find(r => r.id === params[0]);
    return sim ? [{ completed_agents: sim.completed_agents, num_agents: sim.num_agents }] : [];
  }

  // SELECT * FROM simulations WHERE id = ?
  if (s.includes('from simulations') && s.includes('where id') && !s.includes('join')) {
    return T.simulations.filter(r => r.id === params[0]);
  }

  // Aggregated JOIN: COUNT / SUM from simulations + agent_sessions
  if (s.includes('from simulations') && s.includes('join agent_sessions') && s.includes('count')) {
    return [...T.simulations].sort((a, b) => b.id - a.id).slice(0, 10).map(sim => {
      const sess = T.agent_sessions.filter(s => s.simulation_id === sim.id);
      return {
        simulation_id: sim.id,
        total_agents: sess.length,
        purchases: sess.filter(s => s.final_status === 'CONVERTED').length,
        bounces: sess.filter(s => s.final_status === 'BOUNCED').length,
      };
    });
  }

  // SELECT * FROM simulations (list)
  if (s.includes('from simulations') && !s.includes('join') && !s.includes('where')) {
    let rows = [...T.simulations].sort((a, b) => b.id - a.id);
    const lm = s.match(/limit (\d+)/);
    if (lm) rows = rows.slice(0, parseInt(lm[1]));
    return rows;
  }

  // SELECT * FROM agent_sessions WHERE simulation_id = ?
  if (s.includes('from agent_sessions') && s.includes('simulation_id')) {
    return T.agent_sessions.filter(r => r.simulation_id === params[0]).sort((a, b) => a.id - b.id);
  }

  // SELECT FROM agent_logs JOIN agent_sessions with since_id
  if (s.includes('from agent_logs') && s.includes('join agent_sessions') && s.includes('l.id >')) {
    const simId = params[0], sinceId = params[1] ?? 0;
    const sessions = T.agent_sessions.filter(s => s.simulation_id === simId);
    const sids = new Set(sessions.map(s => s.id));
    const logs = T.agent_logs.filter(l => sids.has(l.session_id) && l.id > sinceId).slice(0, 80);
    return logs.map(l => { const s = sessions.find(s => s.id === l.session_id); return { ...l, agent_id: s?.agent_id, persona: s?.persona }; });
  }

  // SELECT FROM agent_logs JOIN agent_sessions (all logs for simulation)
  if (s.includes('from agent_logs') && s.includes('join agent_sessions') && s.includes('simulation_id')) {
    const simId = params[0];
    const sessions = T.agent_sessions.filter(s => s.simulation_id === simId);
    const sids = new Set(sessions.map(s => s.id));
    const logs = T.agent_logs.filter(l => sids.has(l.session_id));
    return logs.map(l => { const s = sessions.find(s => s.id === l.session_id); return { ...l, agent_id: s?.agent_id, persona: s?.persona }; });
  }

  return [];
}
