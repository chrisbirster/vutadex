import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const entry=fileURLToPath(new URL('../index.ts',import.meta.url));

test('local image import yields stable content hash, supports lookup, rejects invalid files',()=>{
 const home=mkdtempSync(join(tmpdir(),'vutadex-m5-media-'));
 try{
  const run=(args:string[])=>spawnSync(process.execPath,[entry,...args],{
    encoding:'utf8',timeout:15000,
    env:{...process.env,HOME:home,USERPROFILE:home,LOCALAPPDATA:join(home,'data'),XDG_DATA_HOME:join(home,'data')}
  });
  const png=join(home,'image.png');
  writeFileSync(png,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL5XQAAAABJRU5ErkJggg==','base64'));
  const added=run(['media','add',png]);
  assert.equal(added.status,0,added.stderr);
  const reference=added.stdout.match(/deez-media:\/\/sha256:[0-9a-f]{64}/)?.[0];
  assert.ok(reference);
  const again=run(['media','add',png]);
  assert.equal(again.status,0,again.stderr);
  assert.match(again.stdout,new RegExp(reference.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  const found=run(['media','inspect',reference]);
  assert.equal(found.status,0,found.stderr);
  assert.match(found.stdout,/image\/png/);
  assert.equal(run(['media','inspect','deez-media://sha256:'+'1'.repeat(64)]).status,1);
  const bad=join(home,'bad.svg');
  writeFileSync(bad,'<svg></svg>');
  assert.equal(run(['media','add',bad]).status,1);
 }finally{rmSync(home,{recursive:true,force:true});}
});
