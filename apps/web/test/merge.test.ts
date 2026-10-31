import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeEdits,applySelections,type EditableNote} from '../src/merge.ts';
const note=(front:string,back:string,tags=''):EditableNote=>({type:'basic',front,back,fields:[front,back],tags});
test('nonoverlapping changes merge automatically',()=>{
  const base=note('A','B'),local=note('A','B','local'),remote=note('Server A','B');
  const out=mergeEdits(base,local,remote);
  assert.deepEqual(out.overlaps,[]);
  assert.equal(out.merged.tags,'local');assert.equal(out.merged.front,'Server A');
});
test('simultaneous changed content remains remote until explicit user selection',()=>{
  const base=note('A','B'),local=note('Local A','B'),remote=note('Server A','B');
  const out=mergeEdits(base,local,remote);
  assert.ok(out.overlaps.includes('front'));
  assert.ok(out.overlaps.includes('fields'));
  assert.equal(out.merged.front,'Server A');
  assert.equal(applySelections(remote,local,['front','fields']).front,'Local A');
});
test('merge result is immutable and handles structured choices',()=>{
  const base:EditableNote={type:'multiple-choice',front:'Prompt',back:'',fields:['Prompt','[{"id":"a","text":"A"}]','a',''],tags:''};
  const remote={...base,tags:'new'},local={...base,fields:['Prompt','[{"id":"a","text":"B"}]','a','']};
  const result=mergeEdits(base,local,remote);
  assert.deepEqual(result.overlaps,[]);
  assert.deepEqual(result.merged.fields,local.fields);
  assert.equal(base.tags,'');
});
