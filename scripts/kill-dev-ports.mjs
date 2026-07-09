import { execSync } from 'node:child_process';

const PORTS = [3001, 5173, 5174];

for (const port of PORTS) {
  try {
    const pids = execSync(`lsof -ti:${port}`, { encoding: 'utf8' }).trim();
    if (pids) {
      execSync(`kill -9 ${pids.split('\n').join(' ')}`);
      console.log(`Freed port ${port}`);
    }
  } catch {
    // Port not in use
  }
}
