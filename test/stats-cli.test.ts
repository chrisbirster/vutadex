import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../index.ts', import.meta.url));

test('stats CLI renders global and deck snapshots; invalid input returns nonzero', () => {
  const home = mkdtempSync(join(tmpdir(),'vutadex-stats-'));
  const env = { ...process.env, HOME:home, USERPROFILE:home,
    LOCALAPPDATA: join(home,'local'), XDG_DATA_HOME:join(home,'xdg') };
  const run = (args: string[]) => spawnSync(process.execPath,[entry,...args],
    { env,encoding:'utf8',timeout:15000 });
  try {
    const empty = run(['stats']);
    assert.equal(empty.status,0,empty.stderr);
    assert.match(empty.stdout,/Study statistics/);
    assert.match(empty.stdout,/Active cards/);
    assert.match(empty.stdout,/\d{4}-\d{2}-\d{2}/); // dates in a UTC forecast
    const created = run(['deck','create','Spanish']);
    assert.equal(created.status,0,created.stderr);
    assert.equal(run(['card','add','1','--front','Hello','--back','Hola']).status,0);
    const result=run(['stats','1','--days','2']);
    assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/deck 1/);
    assert.match(result.stdout,/New cards/);
    assert.match(result.stdout,/Scheduled due dates/);
    assert.equal(run(['stats','--days','1','1']).status,0);
    for (const args of [
      ['stats','999'],['stats','--days','0'],['stats','--days','91'],
      ['stats','--days','not-a-number'],['stats','1','1'],
      ['stats','--days'],['stats','--bad'],['stats','1','--days','7','unexpected']
    ]) {
      const bad=run(args);
      assert.equal(bad.status,1,args.join(' ')+'\n'+bad.stderr);
    }
    assert.equal(run(['card','list','1']).status,0);
  } finally { rmSync(home,{recursive:true,force:true}); }
});
