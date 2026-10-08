import path from 'node:path';
import os from 'node:os';
import { mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(root);
// Vite also exposes inherited VITE_* variables. Drop them before loading tools.
for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key];
process.env.VITE_MODE = 'demo';

function node(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`Verification failed: ${args[0]}`);
}
node(['node_modules/typescript/bin/tsc', '-b']);
node(['node_modules/typescript/bin/tsc', '--noEmit', '--strict', '--target', 'ES2023',
  '--module', 'ESNext', '--moduleResolution', 'bundler', '--skipLibCheck', 'server/db/tenant.ts']);
const { startVitest } = await import('vitest/node');
// Keep transforms bounded on developer machines; assertions and deadlines remain unchanged.
const ctx = await startVitest('test', ['tests/'], { run: true, config: false, maxWorkers: 1, fileParallelism: false }, {
  envFile: false, envDir: false, resolve: { alias: { '@': path.join(root, 'src') } },
});
if (!ctx) throw new Error('Test runner did not start');
await ctx.close();
if (process.exitCode) throw new Error('Application tests failed');
node(['--test', 'server/storage.test.mjs', 'server/r2-storage.test.mjs']);
node(['--test', 'server/jobs.test.mjs', 'scripts/migration/local-ui.test.mjs']);

// Vitest sets NODE_ENV=test; do not let that select React's development build.
process.env.NODE_ENV = 'production';
const { build } = await import('vite');
for (const mode of ['demo', 'local']) {
  process.env.VITE_MODE = mode;
  const outDir = mkdtempSync(path.join(os.tmpdir(), `bookdrop-${mode}-build-`));
  await build({ envFile: false, envDir: false, logLevel: 'warn', build: { outDir, emptyOutDir: false } });
  console.log(`PASS: ${mode} build; output=${outDir}; environment files disabled`);
}
