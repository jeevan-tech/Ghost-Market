import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { run } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const { targetUrl, numAgents } = await request.json();

        if (!targetUrl) {
            return NextResponse.json({ error: 'Target URL is required' }, { status: 400 });
        }

        // 1. Create the simulation row immediately so the dashboard shows it right away
        const numA = numAgents || 5;
        const result = await run(
            "INSERT INTO simulations (target_url, num_agents, status) VALUES (?, ?, 'running')",
            [targetUrl, numA]
        );
        const simulationId = result.lastID;

        // 2. Resolve the path to the engine directory
        const enginePath = path.resolve(process.cwd(), '../engine');

        // 3. Launch swarm script passing the pre-created simulation_id as 3rd arg
        const pythonExe = path.join(enginePath, 'venv', 'bin', 'python3');
        const child = spawn(pythonExe, ['swarm.py', targetUrl, numA.toString(), simulationId.toString()], {
            cwd: enginePath,
            detached: true,
            stdio: 'ignore'
        });

        // Unref allows the parent node process to exit independently of the child python process
        child.unref();

        return NextResponse.json({ success: true, message: 'Swarm simulation initiated', simulationId });

    } catch (error) {
        console.error("Failed to start simulation:", error);
        return NextResponse.json({ error: 'Failed to trigger swarm process' }, { status: 500 });
    }
}

