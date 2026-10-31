import {test} from 'node:test';
import assert from 'node:assert/strict';
import {studyPresentation} from '../server/study-presentation.ts';
import {compareTypedAnswer} from '../src/typed-answer.ts';
test('image presentation selects the specific generated mask without leaking answers',()=>{
  const hash='b'.repeat(64),ref='deez-media://sha256:'+hash;
  const masks=JSON.stringify([
    {id:1,x:0.1,y:0.1,width:0.2,height:0.2,answer:'Hidden A'},
    {id:7,x:0.4,y:0.3,width:0.2,height:0.2,answer:'Hidden B',prompt:'Which organ?'}
  ]);
  const result=studyPresentation('image-occlusion',JSON.stringify([ref,masks,'Extra']),'occlusion:7');
  assert.equal(result.kind,'image-occlusion');
  if(result.kind!=='image-occlusion')return;
  assert.equal(result.mask.id,7);
  assert.equal(result.prompt,'Which organ?');
  assert.equal(result.otherMasks.length,1);
  assert.ok(!JSON.stringify(result).includes('Hidden A'));
  assert.ok(!JSON.stringify(result).includes('Hidden B'));
  assert.throws(()=>studyPresentation('image-occlusion',JSON.stringify([ref,masks,'']),'occlusion:8'),/mask is missing/);
});
test('typed-answer hint normalizes unicode, case and spaces without assigning study ratings',()=>{
  assert.equal(compareTypedAnswer('  cAfÉ   au LAIT ','café au lait'),'match');
  assert.equal(compareTypedAnswer('','A'),'empty');
  assert.equal(compareTypedAnswer('wrong','correct'),'different');
});
