import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseBase64Media,inspectImage,refHash} from '../server/media.ts';
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';
test('image accepts small PNG, computes exact ownership key and rejects active content',()=>{
  const accepted=parseBase64Media(PNG);
  assert.equal(accepted.mime,'image/png');
  assert.equal(accepted.width,1);assert.equal(accepted.height,1);
  assert.equal(refHash('deez-media://sha256:'+accepted.sha256),accepted.sha256);
  assert.equal(refHash('https://example.com/bad.svg'),null);
  assert.throws(()=>inspectImage(Buffer.from('<svg onload="alert(1)"></svg>')),/Only PNG/);
  assert.throws(()=>parseBase64Media('!!!!'),/base64/);
  assert.throws(()=>parseBase64Media(Buffer.alloc(2_097_153).toString('base64')),/2 MiB/);
});
