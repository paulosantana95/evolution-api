/**
 * Historical entry pointed at by `npm test` (watch mode).
 * Baseline suite lives in test/baseline and is run with `npm run test:baseline`.
 */
import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['--import', 'tsx', '--test', 'test/baseline'], {
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 1));
