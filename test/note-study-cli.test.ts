import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const entry=fileURLToPath(new URL('../index.ts',import.meta.url));
function fixture(fn:(home:string,run:(args:string[],input?:string)=>ReturnType<typeof spawnSync>)=>void):void{
 const home=mkdtempSync(join(tmpdir(),'vutadex-m5-interact-'));
 try{
  const run=(args:string[],input='')=>spawnSync(process.execPath,[entry,...args],{
   encoding:'utf8',input,timeout:20000,
   env:{...process.env,HOME:home,USERPROFILE:home,LOCALAPPDATA:join(home,'data'),XDG_DATA_HOME:join(home,'data')}
  });
  assert.equal(run(['deck','create','Mixed']).status,0);
  fn(home,run);
 }finally{rmSync(home,{recursive:true,force:true});}
}
test('typed-answer prompt compares response then accepts deliberate FSRS rating',()=>fixture((_home,run)=>{
 const added=run(['note','add','1','type','Capital of France','Paris']);
 assert.equal(added.status,0,added.stderr);
 const studied=run(['study','1'],'paris\n3\n\n');
 assert.equal(studied.status,0,studied.stderr);
 assert.match(studied.stdout,/Correct answer/);
 assert.match(studied.stdout,/Recorded Good/);
 assert.match(run(['card','history','1']).stdout,/Good/);
}));
test('multiple-choice can accept option number and self-rated review',()=>fixture((_home,run)=>{
 const choices=JSON.stringify([{id:'a',text:'Apple'},{id:'b',text:'Banana'}]);
 assert.equal(run(['note','add','1','mcq','Which fruit? ',choices,'b','An explanation']).status,0);
 const studied=run(['study','1'],'2\n2\n\n');
 assert.equal(studied.status,0,studied.stderr);
 assert.match(studied.stdout,/Correct answer/);
 assert.match(studied.stdout,/Recorded Hard/);
}));
test('multiple-select and ordering are interactive and accept comma separated options',()=>fixture((_home,run)=>{
 const choices=JSON.stringify([{id:'x',text:'X'},{id:'y',text:'Y'},{id:'z',text:'Z'}]);
 assert.equal(run(['note','add','1','multiple-select','Choose x and z',choices,'["x","z"]','']).status,0);
 assert.equal(run(['note','add','1','ordering','Put x y z in order',choices,'']).status,0);
 const studied=run(['study','1'],'1,3\n3\n3,1,2\n3\n\n');
 assert.equal(studied.status,0,studied.stderr);
 assert.match(studied.stdout,/Session complete/);
 assert.equal((studied.stdout.match(/Correct answer/g)??[]).length,2);
 assert.match(run(['card','history','2']).stdout,/Good/);
}));
test('structured answer /skip leaves FSRS unchanged',()=>fixture((_home,run)=>{
 const choices=JSON.stringify([{id:'a',text:'A'},{id:'b',text:'B'}]);
 assert.equal(run(['note','add','1','mcq','Choose',choices,'a','']).status,0);
 const studied=run(['study','1'],'/skip\n');
 assert.equal(studied.status,0,studied.stderr);
 assert.match(studied.stdout,/Skipped/);
 assert.match(run(['due']).stdout,/Choose/);
}));
