import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../index.ts', import.meta.url).pathname;

function run(args, home) {
  return spawnSync(process.execPath, [root, ...args], {
    encoding: 'utf8',
    env: home
      ? { ...process.env, HOME: home, XDG_DATA_HOME: join(home, 'data') }
      : process.env,
  });
}

test('help prints usage', () => {
  const result = run(['help']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Vutadex/);
});

test('unknown command fails', () => {
  const result = run(['nonexistent']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown command/);
});

test('deck creation persists to subsequent invocation', () => {
  const home = mkdtempSync(join(tmpdir(), 'vutadex-test-'));
  try {
    const created = run(['deck', 'create', 'Spanish'], home);
    assert.equal(created.status, 0, created.stderr);
    const listed = run(['deck', 'list'], home);
    assert.equal(listed.status, 0, listed.stderr);
    assert.match(listed.stdout, /Spanish/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
