import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../index.ts', import.meta.url));
function run(home: string, args: string[], input = '') {
  return spawnSync(process.execPath, [entry, ...args], {
    input, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, HOME: home, USERPROFILE: home,
      LOCALAPPDATA: join(home, 'data'), XDG_DATA_HOME: join(home, 'data') }
  });
}
function sandbox(action: (home: string) => void): void {
  const home = mkdtempSync(join(tmpdir(), 'vutadex-m4-'));
  try { action(home); }
  finally { rmSync(home, { recursive: true, force: true }); }
}
function seed(home: string, count: number): void {
  assert.equal(run(home, ['deck', 'create', 'Study deck']).status, 0);
  for (let i = 1; i <= count; i++) {
    const card = run(home, ['card', 'add', '1', '--front', 'Question ' + i, '--back', 'Answer ' + i]);
    assert.equal(card.status, 0, card.stderr);
  }
}
test('CLI validates flags and shows study help without creating a database', () => sandbox(home => {
  assert.equal(run(home, ['study', '--new', '--all']).status, 1);
  assert.equal(run(home, ['study', '--new-limit', '-1']).status, 1);
  assert.equal(run(home, ['study', '--new-limit', '1001']).status, 1);
  assert.equal(run(home, ['study', '--resume', '1']).status, 1);
  assert.equal(run(home, ['study', '--resume']).status, 1);
  assert.match(run(home, ['study', '--help']).stdout, /Space\/Enter/);
}));
test('study reveals answers, saves ratings, resumes the queue and completes', () => sandbox(home => {
  seed(home, 3);
  const first = run(home, ['study', '1', '--new-limit', '2', '--review-limit', '0'], '\n3\nq\n');
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /Question 1/);
  assert.match(first.stdout, /Answer 1/);
  assert.match(first.stdout, /Recorded Good/);
  assert.match(first.stdout, /Session paused/);
  assert.equal(run(home, ['study', '1', '--new-limit', '1']).status, 1);
  const resumed = run(home, ['study', '--resume'], '\n4\n\n');
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.match(resumed.stdout, /Question 2/);
  assert.match(resumed.stdout, /Session complete/);
  assert.match(run(home, ['card', 'history', '1']).stdout, /Good/);
  assert.match(run(home, ['card', 'history', '2']).stdout, /Easy/);
  assert.equal(run(home, ['study', '--resume']).status, 1);
  assert.match(run(home, ['due', '1']).stdout, /Question 3/);
}));
test('cannot rate before revealing or on empty input; quitting leaves card unchanged', () => sandbox(home => {
  seed(home, 1);
  const studied = run(home, ['study'], '1\nq\n');
  assert.equal(studied.status, 0, studied.stderr);
  assert.match(studied.stdout, /Reveal the answer before giving a rating/);
  assert.match(studied.stdout, /Session paused/);
  assert.match(run(home, ['due']).stdout, /Question 1/);
  assert.doesNotMatch(run(home, ['card', 'history', '1']).stdout, /Good|Again|Easy|Hard/);
}));
test('skip and restart do not schedule skipped cards', () => sandbox(home => {
  seed(home, 2);
  const first = run(home, ['study', '1', '--new-limit', '2'], 's\nq\n');
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /Skipped/);
  const restarted = run(home, ['study', '1', '--restart', '--new-limit', '1'], 'q\n');
  assert.equal(restarted.status, 0, restarted.stderr);
  assert.match(restarted.stdout, /Question 1/);
  assert.match(run(home, ['due', '1']).stdout, /Question 1/);
}));
test('u undoes last session rating, appends undo history and restores queue', () => sandbox(home => {
  seed(home, 2);
  const studied = run(home, ['study', '1', '--new-limit', '2'], '\n2\nu\nq\n');
  assert.equal(studied.status, 0, studied.stderr);
  assert.match(studied.stdout, /Undid rating for card #1/);
  const history = run(home, ['card', 'history', '1']);
  assert.equal(history.status, 0, history.stderr);
  assert.match(history.stdout, /undo/);
  assert.match(run(home, ['due', '1']).stdout, /Question 1/);
  const resumed = run(home, ['study', '--resume'], 'q\n');
  assert.match(resumed.stdout, /Question 1/);
}));
test('missing due cards exits with a successful empty-session report', () => sandbox(home => {
  assert.equal(run(home, ['deck', 'create', 'Empty']).status, 0);
  const studied = run(home, ['study', '1']);
  assert.equal(studied.status, 0, studied.stderr);
  assert.match(studied.stdout, /No matching cards/);
}));
