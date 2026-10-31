import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateNote,generateVariants,parseDeckFile,serializeDeckFile,parseCsv} from '../server/content.ts';
const make=(type:string,fields:string[])=>validateNote({type,fields,tags:'foo'});
test('existing note variants survive and full advanced note types generate correctly',()=>{
  assert.deepEqual(generateVariants(validateNote({type:'reverse',front:'France',back:'Paris',tags:''})).map(x=>x.name),['front','reverse']);
  assert.deepEqual(generateVariants(validateNote({type:'cloze',front:'The {{c1::sun}} is a {{c2::star}}.',back:'',tags:''})).map(x=>x.name),['cloze:1','cloze:2']);
  const opt=make('optional-reverse',['A','B','yes']);
  assert.equal(generateVariants(opt).length,2);
  assert.equal(generateVariants(make('optional-reverse',['A','B',''])).length,1);
  assert.equal(generateVariants(make('type-answer',['Q','typed answer'])).length,1);
  const choices=JSON.stringify([{id:'a',text:'Paris'},{id:'b',text:'London'}]);
  assert.match(generateVariants(make('multiple-choice',['Capital of France?',choices,'a','Hint']))[0]!.back,/Paris/);
  assert.match(generateVariants(make('multiple-select',['Choose cities',choices,JSON.stringify(['a','b']),'']))[0]!.back,/London/);
  assert.match(generateVariants(make('ordering',['Order',choices,'']))[0]!.back,/Correct order/);
});
test('reject invalid choice schema rather than persisting partial content',()=>{
  assert.throws(()=>make('multiple-choice',['Prompt','[{"id":"a","text":"A"}]','a','']),/2–100/);
  assert.throws(()=>make('multiple-select',['Prompt','[{"id":"a","text":"A"},{"id":"b","text":"B"}]','["c"]','']),/present in choices/);
  assert.throws(()=>make('image-occlusion',['x','[]','']),/Unsupported note type/);
});
test('portable v2 preserves extended fields',()=>{
  const record=make('multiple-choice',['Which city?',JSON.stringify([{id:'a',text:'Paris'},{id:'b',text:'Rome'}]),'a','Because']);
  const file=serializeDeckFile({name:'Knowledge',notes:[record]});
  assert.deepEqual(parseDeckFile(file).notes[0]!.fields,record.fields);
  assert.throws(()=>parseDeckFile(file+'{"kind":"review","rating":4}\n'),/Unexpected fields/);
  assert.throws(()=>parseDeckFile(file.replace('"version":2','"version":3')),/version 2/);
});
test('CSV mapping handles quotes and multiline and bounds',()=>{
  const parsed=parseCsv('front,back,tags\n"What, exactly?","Paris","geography"\n"Line\\n2",answer,extra\n','Imported');
  assert.equal(parsed.notes.length,2);
  assert.equal(parsed.notes[0]!.front,'What, exactly?');
  assert.throws(()=>parseCsv('front,back\n"unterminated','X'),/Unclosed/);
});
