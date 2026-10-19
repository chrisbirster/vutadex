import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { importImage, locateImage } from '../services/media.ts';

test('all supported image signatures are content-addressed and deduplicated',()=>{
  const home=mkdtempSync(join(tmpdir(),'vutadex-media-unit-'));
  const prior={HOME:process.env.HOME,USERPROFILE:process.env.USERPROFILE,
    LOCALAPPDATA:process.env.LOCALAPPDATA,XDG_DATA_HOME:process.env.XDG_DATA_HOME};
  process.env.HOME=home;process.env.USERPROFILE=home;
  process.env.LOCALAPPDATA=join(home,'data');process.env.XDG_DATA_HOME=join(home,'data');
  try{
    const formats=[
      ['png',Buffer.from([137,80,78,71,13,10,26,10]),'image/png'],
      ['jpg',Buffer.from([255,216,255,0]),'image/jpeg'],
      ['webp',Buffer.from('RIFF1234WEBP','ascii'),'image/webp'],
      ['gif',Buffer.from('GIF89a','ascii'),'image/gif'],
      ['gif87',Buffer.from('GIF87a','ascii'),'image/gif']
    ] as const;
    const seen=new Set<string>();
    for(const [ext,bytes,mime] of formats){
      const filename=join(home,'test.'+ext);
      writeFileSync(filename,bytes);
      const saved=importImage(filename);
      assert.equal(saved.mime,mime);
      assert.equal(saved.bytes,bytes.length);
      assert.ok(saved.reference.startsWith('deez-media://sha256:'));
      assert.equal(locateImage(saved.reference).mime,mime);
      assert.equal(importImage(filename).reference,saved.reference);
      seen.add(saved.reference);
    }
    assert.equal(seen.size,formats.length);
  }finally{
    for(const [key,value] of Object.entries(prior)){
      if(value===undefined)delete process.env[key];
      else process.env[key]=value;
    }
    rmSync(home,{recursive:true,force:true});
  }
});

test('media import and inspect enforce size, signatures, storage and checksums',()=>{
  const home=mkdtempSync(join(tmpdir(),'vutadex-media-errors-'));
  const prior={HOME:process.env.HOME,USERPROFILE:process.env.USERPROFILE,
    LOCALAPPDATA:process.env.LOCALAPPDATA,XDG_DATA_HOME:process.env.XDG_DATA_HOME};
  process.env.HOME=home;process.env.USERPROFILE=home;
  process.env.LOCALAPPDATA=join(home,'data');process.env.XDG_DATA_HOME=join(home,'data');
  try{
    const empty=join(home,'empty.png');
    writeFileSync(empty,'');
    assert.throws(()=>importImage(empty),/regular file/);
    assert.throws(()=>importImage(home),/regular file/);
    const unknown=join(home,'file.unknown');
    writeFileSync(unknown,'not a real image');
    assert.throws(()=>importImage(unknown),/Only PNG/);
    const huge=join(home,'huge.png');
    writeFileSync(huge,Buffer.alloc(20*1024*1024+1));
    assert.throws(()=>importImage(huge),/20 MiB/);
    assert.throws(()=>locateImage('bogus'),/Invalid content-addressed/);
    assert.throws(()=>locateImage('deez-media://sha256:'+'f'.repeat(64)),/not available/);
    const valid=join(home,'good.png');
    writeFileSync(valid,Buffer.from([137,80,78,71,13,10,26,10]));
    const saved=importImage(valid);
    writeFileSync(saved.path,'corrupted');
    assert.throws(()=>locateImage(saved.reference),/checksum mismatch/);
    assert.throws(()=>importImage(valid),/checksum mismatch/);
  }finally{
    for(const [key,value] of Object.entries(prior)){
      if(value===undefined)delete process.env[key];
      else process.env[key]=value;
    }
    rmSync(home,{recursive:true,force:true});
  }
});
