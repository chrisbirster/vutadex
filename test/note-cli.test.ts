import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const entry=fileURLToPath(new URL('../index.ts',import.meta.url));
function withDb(fn:(dir:string)=>void):void {
 const home=mkdtempSync(join(tmpdir(),'vutadex-notes-'));
 try{fn(home);}finally{rmSync(home,{recursive:true,force:true});}
}
function cmd(home:string,args:string[]){
 return spawnSync(process.execPath,[entry,...args],{encoding:'utf8',timeout:15000,
  env:{...process.env,HOME:home,USERPROFILE:home,LOCALAPPDATA:join(home,'data'),XDG_DATA_HOME:join(home,'data')}});
}
test('note CLI creates and updates reverse cards without losing IDs or reviews',()=>withDb(home=>{
 assert.equal(cmd(home,['deck','create','Geography']).status,0);
 assert.match(cmd(home,['note','types']).stdout,/cloze/);
 const note=cmd(home,['note','add','1','reverse','France','Paris']);
 assert.equal(note.status,0,note.stderr);
 assert.match(note.stdout,/cards: 1, 2/);
 assert.match(cmd(home,['card','list','1']).stdout,/Paris/);
 assert.equal(cmd(home,['card','review','1','good']).status,0);
 assert.equal(cmd(home,['note','edit','1','Italy','Rome']).status,0);
 assert.match(cmd(home,['card','history','1']).stdout,/Good/);
 assert.match(cmd(home,['card','show','1']).stdout,/Italy/);
 assert.equal(cmd(home,['card','edit','1','--front','Oops']).status,1);
 assert.equal(cmd(home,['card','delete','1','--yes']).status,1);
 assert.match(cmd(home,['note','show','1']).stdout,/Italy/);
 assert.equal(cmd(home,['note','delete','1']).status,1);
 assert.equal(cmd(home,['note','delete','1','--yes']).status,0);
 assert.equal(cmd(home,['card','list','1']).status,0);
 assert.doesNotMatch(cmd(home,['card','list','1']).stdout,/Italy/);
 assert.doesNotMatch(cmd(home,['due','1']).stdout,/Italy/);
 assert.equal(cmd(home,['card','review','1','good']).status,1);
 assert.match(cmd(home,['card','history','1']).stdout,/Good/);
}));
test('cloze generates separate stable cards and validates bad input',()=>withDb(home=>{
 assert.equal(cmd(home,['deck','create','Language']).status,0);
 const note=cmd(home,['note','add','1','cloze','{{c1::Paris}} is in {{c2::France}}','Europe']);
 assert.equal(note.status,0,note.stderr);
 assert.match(note.stdout,/cards: 1, 2/);
 assert.match(cmd(home,['note','list','1']).stdout,/cloze/);
 assert.equal(cmd(home,['note','edit','1','{{c2::France}} contains {{c1::Paris}}','Europe']).status,0);
 assert.match(cmd(home,['note','show','1']).stdout,/cloze:1/);
 assert.equal(cmd(home,['note','add','1','cloze','{{c0::invalid}}','']).status,1);
 assert.equal(cmd(home,['note','add','1','mcq','Prompt','[]','x','']).status,1);
}));
