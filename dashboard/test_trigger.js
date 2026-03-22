const { spawn } = require('child_process');
const path = require('path');
const enginePath = path.resolve('../engine');
const pythonExe = path.join(enginePath, 'venv', 'bin', 'python3');
const child = spawn(pythonExe, ['swarm.py', 'https://example.com', '1'], {
    cwd: enginePath,
});
child.stdout.on('data', (data) => console.log(`stdout: ${data}`));
child.stderr.on('data', (data) => console.error(`stderr: ${data}`));
child.on('close', (code) => console.log(`child process exited with code ${code}`));
