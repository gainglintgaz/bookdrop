import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Existing image only, no published ports, no network, no host mounts or env files.
const image = 'postgres:17.6';
const name = `bookdrop-core-test-${randomUUID()}`;
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  if (result.error || result.status !== 0) throw new Error(`Local database command failed: ${result.error?.message ?? result.stderr}`);
  return result.stdout.trim();
}
function query(sql) {
  return docker(['exec', '-i', name, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], sql);
}
let started = false;
try {
  docker(['image', 'inspect', image, '--format', '{{.Id}}']);
  docker(['run', '--detach', '--name', name, '--network', 'none', '--label', 'purpose=bookdrop-core-test',
    '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', image, 'postgres', '-c', 'listen_addresses=']);
  started = true;
  const state = JSON.parse(docker(['inspect', name, '--format', '{{json .HostConfig}}']));
  if (state.NetworkMode !== 'none' || Object.keys(state.PortBindings ?? {}).length) throw new Error('Isolation check failed');
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { query('select 1'); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  if (!ready) throw new Error('Local database did not start');
  query(readFileSync(new URL('../../server/db/001-core.sql', import.meta.url), 'utf8'));
  console.log(query(readFileSync(new URL('../../server/db/core.integration.sql', import.meta.url), 'utf8')));
  // New connection proves committed data survives connection closure.
  if (query("select business_name from clients where portal_token='fixture-one'") !== 'Persisted local change') {
    throw new Error('Reconnect persistence failed');
  }
  console.log('PASS: committed write read back on a new connection; PostgreSQL 17.6, network=none');
} finally {
  // Retain the stopped, uniquely named test container for inspection; no deletion.
  if (started) docker(['stop', name]);
  console.log(`Local test container: ${name}`);
}
