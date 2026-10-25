import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('npm tarball contains executable and every canonical SQL asset', () => {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['pack', '--dry-run', '--ignore-scripts', '--json'], {
    encoding: 'utf8', timeout: 60_000,
    shell: process.platform === 'win32'
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout) as Array<{files:Array<{path:string}>}>;
  const names = new Set(output[0]!.files.map(item => item.path));
  assert.ok(names.has('dist/index.js'), 'compiled CLI missing');
  for (const filename of [
    '001_initial.sql', '002_fsrs.sql', '003_study_sessions.sql', '004_notes.sql', '005_unique_deck_names.sql'
  ]) {
    assert.ok(names.has('dist/database/migrations/' + filename), filename);
  }
  assert.ok(names.has('dist/database/query/decks/list.sql'));
  assert.ok(names.has('dist/database/query/notes/create.sql'));
  assert.ok(names.has('dist/database/query/deck-file/manual-cards.sql'));
  assert.ok(names.has('dist/database/query/progress/cards.sql'));
  assert.ok(![...names].some(name => name.startsWith('test/')), 'tests leaked into package');
});
