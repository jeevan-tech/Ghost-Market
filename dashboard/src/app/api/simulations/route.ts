import { NextResponse } from 'next/server';
import { query, run } from '@/lib/db';

export async function GET() {
    try {
        // 0. Auto-recover stale simulations: if a 'running' sim has no end_time
        //    and started more than 30 minutes ago, mark it as 'failed'.
        //    This handles cases where the Python process died silently.
        await run(`
            UPDATE simulations
            SET status = 'failed',
                end_time = CURRENT_TIMESTAMP
            WHERE status = 'running'
              AND end_time IS NULL
              AND start_time < datetime('now', '-30 minutes')
        `).catch(() => {});

        // Also clean up any orphaned RUNNING agent sessions whose parent sim failed/completed
        await run(`
            UPDATE agent_sessions
            SET final_status = 'TIMED_OUT'
            WHERE final_status = 'RUNNING'
              AND simulation_id IN (
                  SELECT id FROM simulations
                  WHERE status IN ('failed', 'completed')
              )
        `).catch(() => {});

        // 1. Fetch High-Level Simulation Summaries
        const simulations = await query(`
      SELECT id, target_url, num_agents, status, start_time, end_time, report_summary, completed_agents
      FROM simulations ORDER BY start_time DESC LIMIT 10
    `);

        // 2. Fetch Aggregated Statistics for the most recent simulations
        const statsQuery = `
      SELECT 
        s.id as simulation_id,
        COUNT(a.id) as total_agents,
        SUM(CASE WHEN a.final_status = 'CONVERTED' THEN 1 ELSE 0 END) as purchases,
        SUM(CASE WHEN a.final_status = 'BOUNCED' THEN 1 ELSE 0 END) as bounces
      FROM simulations s
      LEFT JOIN agent_sessions a ON s.id = a.simulation_id
      GROUP BY s.id
      ORDER BY s.start_time DESC LIMIT 10
    `;
        const aggrStats = await query(statsQuery);

        // Merge stats with main simulations object
        const results = simulations.map(sim => {
            const stats = aggrStats.find(s => s.simulation_id === sim.id) || { total_agents: 0, purchases: 0, bounces: 0 };
            return {
                ...sim,
                ...stats,
                conversion_rate: stats.total_agents > 0 ? ((stats.purchases / stats.total_agents) * 100).toFixed(1) + '%' : '0%',
            }
        });

        return NextResponse.json(results);
    } catch (error) {
        console.error("Failed to fetch simulations:", error);
        return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
    }
}
