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

test('card CRUD and search persist across CLI invocations', () => {
  const home = mkdtempSync(join(tmpdir(), 'vutadex-m2-'));
  try {
    assert.equal(run(['deck', 'create', 'Spanish'], home).status, 0);
    const added = run(['card', 'add', '1', '--front', 'hola', '--back', 'hello'], home);
    assert.equal(added.status, 0, added.stderr);
    assert.match(run(['card', 'show', '1'], home).stdout, /hello/);
    assert.match(run(['card', 'search', '1', 'HOL'], home).stdout, /hola/);
    assert.equal(run(['card', 'edit', '1', '--back', 'good morning'], home).status, 0);
    assert.match(run(['card', 'list', '1'], home).stdout, /good morning/);
    assert.equal(run(['card', 'delete', '1'], home).status, 1);
    assert.equal(run(['card', 'delete', '1', '--yes'], home).status, 0);
    assert.equal(run(['card', 'show', '1'], home).status, 1);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('FSRS-7 card reviews persist across process restarts and undo reverts them', () => {
  const home = mkdtempSync(join(tmpdir(), 'vutadex-m3-'));
  try {
    assert.equal(run(['deck', 'create', 'Biology'], home).status, 0);
    assert.equal(run(['card', 'add', '1', '--front', 'mitosis', '--back', 'division'], home).status, 0);
    const before = run(['due', '1'], home);
    assert.equal(before.status, 0, before.stderr);
    assert.match(before.stdout, /mitosis/);
    const reviewed = run(['card', 'review', '1', 'good'], home);
    assert.equal(reviewed.status, 0, reviewed.stderr);
    assert.match(reviewed.stdout, /Next due/);
    const schedule = run(['card', 'schedule', '1'], home);
    assert.equal(schedule.status, 0, schedule.stderr);
    assert.match(schedule.stdout, /reviewCount|review_count/);
    const history = run(['card', 'history', '1'], home);
    assert.equal(history.status, 0, history.stderr);
    assert.match(history.stdout, /Good/);
    const undo = run(['card', 'undo', '1'], home);
    assert.equal(undo.status, 0, undo.stderr);
    const restored = run(['due', '1'], home);
    assert.equal(restored.status, 0, restored.stderr);
    assert.match(restored.stdout, /mitosis/);
    const events = run(['card', 'history', '1'], home);
    assert.match(events.stdout, /undo/);
    assert.equal(run(['card', 'undo', '1'], home).status, 1);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
