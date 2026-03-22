import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/simulations/[id]/live?since=<last_log_id>
 *
 * Returns new agent_log rows (joined with session info) since the given cursor.
 * The frontend polls this every 2 s and advances the cursor after each response.
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const simId = parseInt(id);
        if (isNaN(simId)) {
            return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
        }

        const { searchParams } = new URL(request.url);
        const since = parseInt(searchParams.get('since') ?? '0') || 0;

        const rows = await query(
            `SELECT
                l.id           AS log_id,
                s.agent_id,
                s.persona,
                l.step_number,
                l.thought_process,
                l.action,
                l.target,
                l.page_url,
                l.scroll_depth,
                l.action_success,
                l.duration_ms,
                l.timestamp
             FROM agent_logs l
             JOIN agent_sessions s ON l.session_id = s.id
             WHERE s.simulation_id = ? AND l.id > ?
             ORDER BY l.id ASC
             LIMIT 80`,
            [simId, since]
        );

        // Also return progress snapshot
        const progress = await query(
            `SELECT completed_agents, num_agents FROM simulations WHERE id = ?`,
            [simId]
        );

        return NextResponse.json({
            logs: rows,
            progress: progress[0] ?? { completed_agents: 0, num_agents: 0 },
        });

    } catch (err) {
        console.error('Live feed error:', err);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
