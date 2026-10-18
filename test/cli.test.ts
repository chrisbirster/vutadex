import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const entrypoint = fileURLToPath(new URL('../index.ts', import.meta.url));

function run(args: string[], home?: string) {
  return spawnSync(process.execPath, [entrypoint, ...args], {
    encoding: 'utf8',
    env: home
      ? { ...process.env, HOME: home, USERPROFILE: home, LOCALAPPDATA: join(home, 'data'), XDG_DATA_HOME: join(home, 'data') }
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

test('deck commands persist, validate duplicates and confirm deletion', () => {
  const home = mkdtempSync(join(tmpdir(), 'vutadex-m1-'));
  try {
    const create = run(['deck', 'create', 'History', '--description', 'Dates'], home);
    assert.equal(create.status, 0, create.stderr);
    assert.match(run(['deck', 'show', '1'], home).stdout, /Dates/);
    assert.equal(run(['deck', 'create', 'history'], home).status, 1);
    assert.equal(run(['deck', 'rename', '1', 'World History'], home).status, 0);
    assert.equal(run(['deck', 'describe', '1', 'Ancient'], home).status, 0);
    assert.match(run(['deck', 'show', '1'], home).stdout, /Ancient/);
    assert.equal(run(['deck', 'delete', '1'], home).status, 1);
    assert.match(run(['deck', 'show', '1'], home).stdout, /World History/);
    assert.equal(run(['deck', 'delete', '1', '--yes'], home).status, 0);
    assert.equal(run(['deck', 'show', '1'], home).status, 1);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
