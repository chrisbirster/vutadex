import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../dist/index.js',import.meta.url));

test('v1 acceptance: export, import, study statistics, backup and restore across fresh homes', () => {
  const root=mkdtempSync(join(tmpdir(),'vdex-v1-accept-'));
  const one=join(root,'one'), two=join(root,'two');
  const deckFile=join(root,'shared.deck'), archive=join(root,'backup.json');
  function run(home:string,args:string[]) {
    const env={...process.env,HOME:home,USERPROFILE:home,
      LOCALAPPDATA:join(home,'local'),XDG_DATA_HOME:join(home,'xdg')};
    return spawnSync(process.execPath,[entry,...args],{encoding:'utf8',timeout:30000,env});
  }
  try {
    let result=run(one,['deck','create','Source']);
    assert.equal(result.status,0,result.stderr);
    result=run(one,['note','add','1','reverse','France','Paris']);
    assert.equal(result.status,0,result.stderr);
    result=run(one,['deck','export','1']);
    assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/"format":"plandalf.deck","version":2/);
    writeFileSync(deckFile,result.stdout.replace('"name":"Source"','"name":"Imported"'));
    result=run(one,['deck','import',deckFile]);
    assert.equal(result.status,0,result.stderr);
    result=run(one,['stats','2']);
    assert.equal(result.status,0,result.stderr);
    result=run(one,['backup','create',archive]);
    assert.equal(result.status,0,result.stderr);
    result=run(two,['backup','restore',archive]);
    assert.equal(result.status,0,result.stderr);
    result=run(two,['deck','list']);
    assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/Source/);
    assert.match(result.stdout,/Imported/);
    result=run(two,['backup','restore',archive]);
    assert.notEqual(result.status,0,'restore must not overwrite an existing installation');
  } finally { rmSync(root,{recursive:true,force:true}); }
});
