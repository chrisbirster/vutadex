import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../index.ts', import.meta.url));
const PROCESSES = 8;

function run(env: NodeJS.ProcessEnv, args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [entry, ...args], { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', status => resolve({ status, stdout, stderr }));
  });
}

async function withSandbox(action: (env: NodeJS.ProcessEnv) => Promise<void>): Promise<void> {
  const home = mkdtempSync(join(tmpdir(), 'vdex-concurrency-'));
  const env = { ...process.env, HOME: home, USERPROFILE: home, LOCALAPPDATA: join(home, 'data'), XDG_DATA_HOME: join(home, 'data') };
  try {
    await action(env);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

test('several first runs at once all succeed and migrate once', () => withSandbox(async env => {
  const results = await Promise.all(Array.from({ length: PROCESSES }, (_, i) => run(env, ['deck', 'create', `First ${i}`])));
  for (const result of results) assert.equal(result.status, 0, result.stderr);
  const listed = await run(env, ['deck', 'list']);
  assert.equal(listed.status, 0, listed.stderr);
  for (let i = 0; i < PROCESSES; i++) assert.match(listed.stdout, new RegExp(`First ${i}`));
}));

test('several writers at once on a set-up database all succeed', () => withSandbox(async env => {
  assert.equal((await run(env, ['deck', 'create', 'Seed'])).status, 0);
  const results = await Promise.all(Array.from({ length: PROCESSES }, (_, i) =>
    run(env, ['card', 'add', '1', '--front', `Q${i}`, '--back', `A${i}`])));
  for (const result of results) assert.equal(result.status, 0, result.stderr);
  const listed = await run(env, ['card', 'list', '1']);
  for (let i = 0; i < PROCESSES; i++) assert.match(listed.stdout, new RegExp(`Q${i}\\b`));
}));
