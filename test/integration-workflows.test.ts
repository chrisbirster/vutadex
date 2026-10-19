import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../index.ts', import.meta.url));
type Run = (args: string[], input?: string) => SpawnSyncReturns<string>;
function sandbox(action: (home: string, run: Run) => void): void {
  const home=mkdtempSync(join(tmpdir(),'vutadex-full-integration-'));
  const env = {...process.env,HOME:home,USERPROFILE:home,
    LOCALAPPDATA:join(home,'data'),XDG_DATA_HOME:join(home,'data')};
  const run:Run=(args,input='')=>spawnSync(process.execPath,[entry,...args],
    {input,encoding:'utf8',timeout:20000,env});
  try { action(home,run); }
  finally { rmSync(home,{recursive:true,force:true}); }
}
function ok(result: SpawnSyncReturns<string>): void {
  assert.equal(result.status,0,result.stderr || result.stdout);
}

test('full CLI lifecycle: deck, manual card, generated notes, study, undo and cascading deletion',()=>sandbox((_home,run)=>{
  ok(run(['deck','create','German']));
  ok(run(['card','add','1','--front','hallo','--back','hello']));
  ok(run(['note','add','1','reverse','Germany','Berlin']));
  assert.match(run(['card','list','1']).stdout,/Germany/);
  ok(run(['card','review','1','good']));
  const first=run(['study','1','--new-limit','2','--review-limit','0'],'\n3\nq\n');
  ok(first);
  assert.match(first.stdout,/Session paused/);
  assert.match(run(['card','history','2']).stdout,/Good/);
  const second=run(['study','--resume'],'\n4\n\n');
  ok(second);
  assert.match(second.stdout,/Session complete/);
  assert.match(run(['card','history','3']).stdout,/Easy/);
  ok(run(['note','edit','1','Deutschland','Berlin']));
  assert.match(run(['card','history','2']).stdout,/Good/);
  assert.match(run(['card','show','2']).stdout,/Deutschland/);
  const beforeDelete=run(['deck','show','1']);
  ok(beforeDelete);
  ok(run(['note','delete','1','--yes']));
  assert.doesNotMatch(run(['card','list','1']).stdout,/Deutschland/);
  assert.match(run(['card','history','2']).stdout,/Good/);
  assert.match(run(['card','list','1']).stdout,/hallo/);
  ok(run(['deck','delete','1','--yes']));
  assert.equal(run(['card','show','1']).status,1);
  assert.equal(run(['note','show','1']).status,1);
  assert.equal(run(['deck','list']).status,0);
}));

test('image occlusion CLI uses local media reference and refuses corrupted stored bytes',()=>sandbox((home,run)=>{
  ok(run(['deck','create','Biology']));
  const png=join(home,'diagram.png');
  writeFileSync(png,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL5XQAAAABJRU5ErkJggg==','base64'));
  const imported=run(['media','add',png]);
  ok(imported);
  const reference=imported.stdout.match(/deez-media:\/\/sha256:[0-9a-f]{64}/)?.[0];
  assert.ok(reference);
  const masks=JSON.stringify([{id:1,x:0,y:0,width:0.5,height:0.5,answer:'Cell'}]);
  const note=run(['note','add','1','image-occlusion',reference,masks,'']);
  ok(note);
  assert.match(run(['card','list','1']).stdout,/mask 1/);
  const dataHome=process.platform==='darwin' ? join(home,'Library','Application Support') : join(home,'data');
  const path=join(dataHome,'vutadex','media',reference.slice('deez-media://sha256:'.length));
  assert.ok(readFileSync(path).length>0);
  ok(run(['media','inspect',reference]));
  writeFileSync(path,'corrupted-media');
  const invalid=run(['media','inspect',reference]);
  assert.equal(invalid.status,1);
  assert.match(invalid.stderr,/checksum mismatch/);
}));

test('bad CLI arguments fail without creating flashcards or recording reviews',()=>sandbox((_home,run)=>{
  ok(run(['deck','create','Safe']));
  const bad=[
    ['card','add','1','--front','only front'],
    ['card','add','1','--front','a','--front','b'],
    ['note','add','1','mcq','Prompt','[]','x',''],
    ['note','add','1','type',''],
    ['card','review','1','excellent'],
    ['study','--new-limit','-1'],
    ['deck','delete','1'],
    ['card','delete','100','--yes'],
    ['note','delete','100','--yes']
  ];
  for(const args of bad){
    const result=run(args);
    assert.notEqual(result.status,0,'expected failure for '+args.join(' '));
  }
  const listed=run(['card','list','1']);
  ok(listed);
  assert.doesNotMatch(listed.stdout,/Prompt/);
  assert.equal(run(['card','history','1']).status,1);
  assert.match(run(['deck','show','1']).stdout,/Safe/);
}));

test('version output matches package metadata after command cleanup',()=>sandbox((_home,run)=>{
  const manifest=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')) as {version:string};
  const printed=run(['version']);
  ok(printed);
  assert.match(printed.stdout,new RegExp('v'+manifest.version.replace(/\./g,'\\.')));
}));
