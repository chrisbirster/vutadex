import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const entry=fileURLToPath(new URL('../index.ts',import.meta.url));
test('all top-level commands reject malformed arguments predictably in a persistent sandbox',()=>{
  const home=mkdtempSync(join(tmpdir(),'vutadex-invalid-args-'));
  const env={...process.env,HOME:home,USERPROFILE:home,
    LOCALAPPDATA:join(home,'data'),XDG_DATA_HOME:join(home,'data')};
  const run=(args:string[])=>spawnSync(process.execPath,[entry,...args],
    {encoding:'utf8',timeout:15000,env});
  try {
    const good=run(['deck','create','Safe']);
    assert.equal(good.status,0,good.stderr);
    const invalid:string[][]=[
      ['not-a-command'], ['stats'], ['deck'], ['deck','list','extra'],
      ['deck','show'], ['deck','show','0'], ['deck','show','999'],
      ['deck','create'], ['deck','create','  '],
      ['deck','rename'], ['deck','rename','0','B'], ['deck','rename','9','B'],
      ['deck','describe','1','--clear','unexpected'],['deck','describe','1','missing','--clear'],
      ['deck','delete'],['deck','delete','0','--yes'],['deck','delete','1','--bogus'],
      ['card'], ['card','add'], ['card','add','0','--front','a','--back','b'],
      ['card','add','1'], ['card','add','1','--front','x'],
      ['card','add','1','--front','a','--front','b'],
      ['card','list'], ['card','list','1','--other'],
      ['card','show'], ['card','show','999'],
      ['card','search','1'], ['card','search','1','   '],
      ['card','history','1','extra'], ['card','schedule','1','extra'],
      ['card','review','1','invalid'], ['card','review','1'],
      ['card','undo','1','extra'], ['card','delete'], ['card','delete','1','--bogus'],
      ['note'], ['note','types','unexpected'], ['note','add'], ['note','list'],
      ['note','list','999'], ['note','show'], ['note','show','999'],
      ['note','edit'], ['note','edit','999','a','b'],
      ['note','delete'], ['note','delete','999','--yes'],
      ['note','add','1','unknown','x','y'],
      ['media'], ['media','add'], ['media','inspect','invalid'],
      ['due','not-an-id'], ['due','1','extra'],
      ['study','--new','--all'], ['study','--resume','extra'],
      ['study','--new-limit','-1'], ['study','--new-limit','1001'],
      ['study','--new-limit','wat'], ['study','--new-limit','1','--new-limit','2'],
      ['study','--review-limit','1001'], ['study','--restart','--restart']
    ];
    for(const args of invalid) {
      const result=run(args);
      assert.equal(result.status,1,'Expected CLI usage failure for '+args.join(' ')+': '+result.stderr);
    }
    const still=run(['deck','show','1']);
    assert.equal(still.status,0,still.stderr);
    assert.match(still.stdout,/Safe/);
    assert.equal(run(['study','--help']).status,0);
  } finally { rmSync(home,{recursive:true,force:true}); }
});
