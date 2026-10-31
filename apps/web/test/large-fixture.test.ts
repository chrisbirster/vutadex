import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseDeckFile,generateVariants,serializeDeckFile} from '../server/content.ts';
test('large deterministic 1196-note fixture retains content/card counts through portable v2 parser',()=>{
  const header=JSON.stringify({kind:'deck',format:'plandalf.deck',version:2,name:'1196 Regression Notes'});
  const rows=Array.from({length:1196},(_,i)=>JSON.stringify({
    kind:'note',note_type:i%3===0?'reverse':'basic',
    fields:['Prompt '+i,'Answer '+i],tags_json:JSON.stringify(['fixture'])
  }));
  const parsed=parseDeckFile([header,...rows].join('\n')+'\n');
  assert.equal(parsed.notes.length,1196);
  const generated=parsed.notes.reduce((sum,n)=>sum+generateVariants(n).length,0);
  assert.equal(generated,1196+Math.ceil(1196/3));
  const again=parseDeckFile(serializeDeckFile(parsed));
  assert.deepEqual(again.notes,parsed.notes);
});
