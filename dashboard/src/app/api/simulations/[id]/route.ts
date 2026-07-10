import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const simId = parseInt(id);

        if (isNaN(simId)) {
            return NextResponse.json({ error: 'Invalid simulation ID' }, { status: 400 });
        }

        // ── 1. Simulation row ──────────────────────────────────────────────
        const sims = await query('SELECT * FROM simulations WHERE id = ?', [simId]);
        if (sims.length === 0) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
        const simulation = sims[0];

        // ── 2. Agent sessions ──────────────────────────────────────────────
        const sessions = await query(
            'SELECT * FROM agent_sessions WHERE simulation_id = ? ORDER BY id ASC',
            [simId]
        );

        // ── 3. All logs for this simulation ────────────────────────────────
        const allLogs: Record<string, unknown>[] = await query(
            `SELECT l.*, s.agent_id, s.persona
             FROM agent_logs l
             JOIN agent_sessions s ON l.session_id = s.id
             WHERE s.simulation_id = ?
             ORDER BY l.id ASC`,
            [simId]
        );

        // ── 4. Attach logs to sessions ─────────────────────────────────────
        const sessionMap = new Map<number, Record<string, unknown>[]>();
        for (const log of allLogs) {
            const sid = log.session_id as number;
            if (!sessionMap.has(sid)) sessionMap.set(sid, []);
            sessionMap.get(sid)!.push(log);
        }
        const sessionsWithLogs = sessions.map((s: Record<string, unknown>) => ({
            ...s,
            logs: sessionMap.get(s.id as number) ?? [],
        }));

        // ── 5. Aggregate stats ─────────────────────────────────────────────
        const total = simulation.num_agents;
        let conversions = simulation.conversions_count;
        let bounces = simulation.bounces_count;
        let timedOut = simulation.timed_out_count;
        let errors = simulation.errors_count;

        const isHybrid = conversions !== null && conversions !== undefined;

        if (!isHybrid) {
            conversions = sessions.filter((s: Record<string, unknown>) => s.final_status === 'CONVERTED').length;
            bounces = sessions.filter((s: Record<string, unknown>) => s.final_status === 'BOUNCED').length;
            timedOut = sessions.filter((s: Record<string, unknown>) => s.final_status === 'TIMED_OUT').length;
            errors = sessions.filter((s: Record<string, unknown>) => s.final_status === 'ERROR').length;
        }

        const conversionRate = total > 0 ? ((conversions / total) * 100).toFixed(1) + '%' : '0%';

        // ── 6. Action funnel ───────────────────────────────────────────────
        const funnel: Record<string, number> = { READ: 0, SCROLL_DOWN: 0, CLICK: 0, BUY: 0, BOUNCE: 0, ERROR: 0 };
        for (const log of allLogs) {
            const a = (log.action as string) ?? '';
            if (a in funnel) funnel[a]++;
        }

        // If it's a large hybrid simulation, scale funnel counts proportionally
        if (isHybrid && sessions.length > 0) {
            const scaleFactor = total / sessions.length;
            for (const key in funnel) {
                funnel[key] = Math.round(funnel[key] * scaleFactor);
            }
        }

        // ── 7. Action heatmap (% of total steps) ──────────────────────────
        const totalSteps = allLogs.length;
        const heatmap = Object.fromEntries(
            Object.entries(funnel).map(([k, v]) => [k, totalSteps > 0 ? Math.round(v / (isHybrid ? (totalSteps * (total / sessions.length)) : totalSteps) * 100) : 0])
        );

        // ── 8. Persona segment analysis ────────────────────────────────────
        const segmentNames = ['Budget / Young', 'Mid-Career Pro', 'Executive', 'Niche / Specialist', 'Skeptic / Edge'];
        const personaSegments = segmentNames.map((label) => {
            const matching = sessions.filter((s: Record<string, unknown>) => {
                const sSeg = (s.segment as string) || '';
                return sSeg.toLowerCase().includes(label.toLowerCase()) || 
                       // Fallback to name check for old simulations
                       (label === 'Budget / Young' && ['Maya', 'Sofia', 'Jake'].some(name => (s.persona as string).includes(name))) ||
                       (label === 'Mid-Career Pro' && ['Marcus', 'Priya', 'Daniel', 'Aisha'].some(name => (s.persona as string).includes(name))) ||
                       (label === 'Executive' && ['Robert', 'Carol', 'Hiro'].some(name => (s.persona as string).includes(name))) ||
                       (label === 'Niche / Specialist' && ['Beverly', 'Tyler', 'Fatima', 'Leo', 'Sam'].some(name => (s.persona as string).includes(name))) ||
                       (label === 'Skeptic / Edge' && ['Alex', 'Nina', 'Greg', 'Mia', 'Omar'].some(name => (s.persona as string).includes(name)));
            });
            let segTotal = matching.length;
            let segConverted = matching.filter((s: Record<string, unknown>) => s.final_status === 'CONVERTED').length;
            let segBounces = matching.filter((s: Record<string, unknown>) => s.final_status === 'BOUNCED').length;

            if (isHybrid && sessions.length > 0) {
                const scaleFactor = total / sessions.length;
                segTotal = Math.round(segTotal * scaleFactor);
                segConverted = Math.round(segConverted * scaleFactor);
                segBounces = Math.round(segBounces * scaleFactor);
            }

            // Avg steps
            const avgSteps = matching.length > 0
                ? +(matching.reduce((acc: number, s: Record<string, unknown>) => {
                    return acc + (sessionMap.get(s.id as number) ?? []).length;
                }, 0) / matching.length).toFixed(1)
                : 0;

            return {
                label,
                total: segTotal,
                conversions: segConverted,
                bounces: segBounces,
                conversionRate: segTotal > 0 ? ((segConverted / segTotal) * 100).toFixed(1) + '%' : '0%',
                bounceRate: segTotal > 0 ? ((segBounces / segTotal) * 100).toFixed(1) + '%' : '0%',
                avgSteps,
            };
        });

        // ── 9. Page journey map ────────────────────────────────────────────
        // Collect unique URLs visited across all sessions
        const urlStats: Record<string, { visits: number; bounces: number; conversions: number }> = {};
        for (const log of allLogs) {
            const u = (log.page_url as string) || '';
            if (!u) continue;
            if (!urlStats[u]) urlStats[u] = { visits: 0, bounces: 0, conversions: 0 };
            urlStats[u].visits++;
            if (log.action === 'BOUNCE') urlStats[u].bounces++;
            if (log.action === 'BUY') urlStats[u].conversions++;
        }
        const pageJourneys = Object.entries(urlStats)
            .sort((a, b) => b[1].visits - a[1].visits)
            .slice(0, 15)
            .map(([url, data]) => ({ url, ...data }));

        // ── 9.5. Focus group debates ───────────────────────────────────────
        const debate = await query(
            'SELECT * FROM simulation_debates WHERE simulation_id = ? ORDER BY id ASC',
            [simId]
        );

        // ── 10. Progress ───────────────────────────────────────────────────
        const progress = {
            completed: (simulation.completed_agents as number) ?? 0,
            total: (simulation.num_agents as number) ?? total,
        };

        return NextResponse.json({
            simulation,
            sessions: sessionsWithLogs,
            stats: { total, conversions, bounces, timedOut, errors, conversionRate },
            funnel,
            heatmap,
            personaSegments,
            pageJourneys,
            progress,
            debate,
        });

    } catch (error) {
        console.error('Simulation detail error:', error);
        return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
    }
}
