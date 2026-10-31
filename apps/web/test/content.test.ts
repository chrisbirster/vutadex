import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateNote,generateVariants,parseDeckFile,serializeDeckFile,parseCsv} from '../server/content.ts';
test('reverse generation deterministic and cloze keys stable',()=>{
  assert.deepEqual(generateVariants(validateNote({type:'reverse',front:'France',back:'Paris',tags:''})).map(x=>x.name),['front','reverse']);
  const cards=generateVariants(validateNote({type:'cloze',front:'The {{c1::sun}} is a {{c2::star}}.',back:'',tags:''}));
  assert.deepEqual(cards.map(x=>x.name),['cloze:1','cloze:2']);
  assert.equal(cards[0]!.front,'The [...] is a star.');
});
test('portable v2 roundtrip and reject history injection before mutation',()=>{
  const note=validateNote({type:'basic',front:'Q\\nquoted',back:'A',tags:'one,two'});
  const file=serializeDeckFile({name:'Knowledge',notes:[note]});
  assert.equal(parseDeckFile(file).notes[0]!.type,'basic');
  assert.equal(parseDeckFile(file).notes[0]!.tags,'one,two');
  assert.throws(()=>parseDeckFile(file+'{"kind":"review","rating":4}\n'),/Unexpected fields/);
  assert.throws(()=>parseDeckFile('{"kind":"deck","format":"plandalf.deck","version":1,"name":"X"}\n'),/version 2/);
  assert.throws(()=>parseDeckFile(file.replace('"version":2','"version":3')),/version 2/);
});
test('CSV mapping handles quotes and multiline and limits',()=>{
  const parsed=parseCsv('front,back,tags\n"What, exactly?","Paris","geography"\n"Line\\n2",answer,extra\n','Imported');
  assert.equal(parsed.notes.length,2);
  assert.equal(parsed.notes[0]!.front,'What, exactly?');
  assert.equal(parsed.notes[1]!.back,'answer');
  assert.throws(()=>parseCsv('front,back\n"unterminated','X'),/Unclosed/);
});
