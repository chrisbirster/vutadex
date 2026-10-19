import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../index.ts', import.meta.url));

test('unknown subcommands fail with usage and leave existing deck untouched', () => {
  const home = mkdtempSync(join(tmpdir(), 'vutadex-dispatch-regression-'));
  const env = { ...process.env, HOME: home, USERPROFILE: home,
    LOCALAPPDATA: join(home, 'local'), XDG_DATA_HOME: join(home, 'xdg') };
  const run = (args: string[]) => spawnSync(process.execPath, [entry, ...args],
    { env, encoding: 'utf8', timeout: 15000 });
  try {
    assert.equal(run(['deck', 'create', 'Keep']).status, 0);
    for (const args of [
      ['card', 'does-not-exist'], ['deck', 'does-not-exist'],
      ['note', 'does-not-exist'], ['media', 'does-not-exist'],
      ['card'], ['deck'], ['note'], ['media']
    ]) {
      const result = run(args);
      assert.equal(result.status, 1, args.join(' ') + ': ' + result.stderr);
      assert.match(result.stderr, /Usage:/, args.join(' '));
    }
    const preserved = run(['deck', 'show', '1']);
    assert.equal(preserved.status, 0, preserved.stderr);
    assert.match(preserved.stdout, /Keep/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
