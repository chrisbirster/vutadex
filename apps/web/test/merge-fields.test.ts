import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconcileFieldPaths,applyFieldSelections,type EditableNote} from '../src/merge.ts';
const n=(fields:string[],tags=''):EditableNote=>({type:'multiple-choice',front:fields[0]||'',back:fields[1]||'',fields,tags});
test('per-index merge preserves independent answer and explanation changes',()=>{
  const base=n(['Question','Choice JSON','a','Old']);
  const local=n(['Question','Choice JSON','a','New explanation']);
  const remote=n(['Changed question','Choice JSON','a','Old']);
  const result=reconcileFieldPaths(base,local,remote);
  assert.deepEqual(result.conflicts,[]);
  assert.deepEqual(result.localChanges,['fields[3]']);
  assert.equal(result.merged.fields[0],'Changed question');
  assert.equal(result.merged.fields[3],'New explanation');
});
test('same field conflict requires selection',()=>{
  const base=n(['Question','Choices','a','']);
  const local=n(['Local prompt','Choices','a','']);
  const remote=n(['Remote prompt','Choices','a','']);
  const result=reconcileFieldPaths(base,local,remote);
  assert.deepEqual(result.conflicts,['fields[0]']);
  assert.equal(result.merged.front,'Remote prompt');
  assert.equal(applyFieldSelections(remote,local,['fields[0]']).front,'Local prompt');
});
test('schema changes fail closed for concurrent field edits',()=>{
  const base=n(['Question','Choices','a','']);
  const local=n(['Question','Choices','a','Why']);
  const remote={...n(['Question','Choices','a','']),type:'ordering'};
  assert.deepEqual(reconcileFieldPaths(base,local,remote).conflicts,['fields[3]']);
});
