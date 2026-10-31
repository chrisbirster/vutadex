import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPortable,inspectPortable} from '../server/portable.ts';
import {parseBase64Media} from '../server/media.ts';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';
test('portable image backup validates media SHA256, MIME and referenced masks',()=>{
  const asset=parseBase64Media(png),ref='deez-media://sha256:'+asset.sha256;
  const masks=JSON.stringify([{id:1,x:0.1,y:0.2,width:0.2,height:0.3,answer:'Bongo'}]);
  const manifest=createPortable({name:'Visual',description:'',
    notes:[{type:'image-occlusion',front:ref,back:masks,fields:[ref,masks,''],tags:''}],
    media:[{hash:asset.sha256,mime:asset.mime,base64:png}]});
  assert.equal(inspectPortable(manifest).media[0]?.hash,asset.sha256);
  assert.equal(inspectPortable(manifest).notes[0]?.fields[1],masks);
  assert.throws(()=>inspectPortable({...manifest,media:[{...manifest.media[0]!,hash:'a'.repeat(64)}]}),/checksum/);
  assert.throws(()=>inspectPortable({...manifest,media:[{...manifest.media[0]!,mime:'text/html'}]}),/MIME/);
  assert.throws(()=>inspectPortable({...manifest,media:[]}),/Missing referenced/);
  assert.throws(()=>inspectPortable({...manifest,notes:[]}),/Unreferenced/);
});
