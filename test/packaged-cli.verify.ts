import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const entry=fileURLToPath(new URL('../dist/index.js',import.meta.url));
const migrationDir=fileURLToPath(new URL('../dist/database/migrations/',import.meta.url));
const queryDir=fileURLToPath(new URL('../dist/database/query/',import.meta.url));

test('compiled CLI retains all migrations and queries and runs without TypeScript loader',()=>{
  assert.ok(existsSync(entry),'Run npm run build before packaged smoke tests.');
  assert.deepEqual(readdirSync(migrationDir).filter(x=>x.endsWith('.sql')).sort(),
    ['001_initial.sql','002_fsrs.sql','003_study_sessions.sql','004_notes.sql']);
  assert.ok(existsSync(join(queryDir,'decks','list.sql')));
  assert.ok(existsSync(join(queryDir,'study','candidates.sql')));
  const home=mkdtempSync(join(tmpdir(),'vutadex-packaged-'));
  const env={...process.env,HOME:home,USERPROFILE:home,LOCALAPPDATA:join(home,'local'),
    XDG_DATA_HOME:join(home,'xdg')};
  const run=(args:string[])=>spawnSync(process.execPath,[entry,...args],{encoding:'utf8',timeout:20000,env});
  try {
    const version=run(['version']);
    assert.equal(version.status,0,version.stderr);
    assert.match(version.stdout,/v0\.5\.0/);
    const created=run(['deck','create','Compiled deck']);
    assert.equal(created.status,0,created.stderr);
    const noted=run(['note','add','1','basic','Compiled question','Compiled answer']);
    assert.equal(noted.status,0,noted.stderr);
    const list=run(['card','list','1']);
    assert.equal(list.status,0,list.stderr);
    assert.match(list.stdout,/Compiled question/);
    const due=run(['due','1']);
    assert.equal(due.status,0,due.stderr);
    assert.match(due.stdout,/Compiled question/);
  }finally{rmSync(home,{recursive:true,force:true});}
});
