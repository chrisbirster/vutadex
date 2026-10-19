import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { getDataHome } from '../utils/paths.ts';

test('data root follows Windows, macOS and XDG semantics independently of CI platform',()=>{
  const previous=Object.getOwnPropertyDescriptor(process,'platform');
  const oldLocal=process.env.LOCALAPPDATA;
  const oldXdg=process.env.XDG_DATA_HOME;
  assert.ok(previous?.configurable,'process.platform must be reconfigurable for this isolated test');
  try{
    const set=(platform:string)=>Object.defineProperty(process,'platform',
      {configurable:true,value:platform});
    set('win32');
    process.env.LOCALAPPDATA=path.join(os.tmpdir(),'local-test-data');
    assert.equal(getDataHome(),process.env.LOCALAPPDATA);
    delete process.env.LOCALAPPDATA;
    assert.equal(getDataHome(),path.join(os.homedir(),'AppData','Local'));
    set('darwin');
    assert.equal(getDataHome(),path.join(os.homedir(),'Library','Application Support'));
    set('linux');
    process.env.XDG_DATA_HOME=path.join(os.tmpdir(),'xdg-test-data');
    assert.equal(getDataHome(),process.env.XDG_DATA_HOME);
    delete process.env.XDG_DATA_HOME;
    assert.equal(getDataHome(),path.join(os.homedir(),'.local','share'));
  }finally{
    if(previous)Object.defineProperty(process,'platform',previous);
    if(oldLocal===undefined)delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA=oldLocal;
    if(oldXdg===undefined)delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME=oldXdg;
  }
});
