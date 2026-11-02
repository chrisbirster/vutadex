import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

// Coverage for the production fail-closed guard in db.ts: a deployed instance
// (NODE_ENV=production) must refuse to boot without TURSO_DATABASE_URL, must
// refuse a remote Turso URL without TURSO_AUTH_TOKEN, and must start normally
// with a configured backend. Existing suites run NODE_ENV=test and do not
// exercise the guard; local dev/tests/CLI behavior is unchanged.

async function availablePort():Promise<number> {
  return await new Promise((accept,reject) => {
    const s=createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{
      const address=s.address();
      if(!address || typeof address==='string') {reject(new Error('Invalid test port'));return;}
      const port=address.port;s.close(()=>accept(port));
    });
  });
}

function spawnServer(env:Record<string,string|undefined>){
  return spawn(process.execPath,['--experimental-strip-types',resolve(import.meta.dirname,'../server/index.ts')],{
    cwd:resolve(import.meta.dirname,'..'),env:{...process.env,...env,APP_ORIGIN:'http://127.0.0.1:5173',FLY_APP_NAME:undefined,LOG_LEVEL:'silent'},stdio:['ignore','ignore','pipe']
  });
}

async function expectBootFailure(env:Record<string,string|undefined>,pattern:RegExp){
  const server=spawnServer(env);
  let stderr='';
  server.stderr?.on('data',(part:Buffer)=>{stderr+=part.toString('utf8');});
  const code=await new Promise<number>((accept)=>server.on('close',(c)=>accept(c??-1)));
  assert.notEqual(code,0,'server must exit non-zero');
  assert.match(stderr,pattern,'boot error names the missing config');
}

test('production boot fails closed without TURSO_DATABASE_URL',async()=>{
  await expectBootFailure({NODE_ENV:'production',TURSO_DATABASE_URL:undefined,TURSO_AUTH_TOKEN:undefined,PORT:'0'},/TURSO_DATABASE_URL is required/);
});

test('production boot fails closed for a remote Turso URL without TURSO_AUTH_TOKEN',async()=>{
  await expectBootFailure({NODE_ENV:'production',TURSO_DATABASE_URL:'libsql://vutadex-web-example.turso.io',TURSO_AUTH_TOKEN:undefined,PORT:'0'},/TURSO_AUTH_TOKEN is required/);
});

test('production boot starts with a configured backend',async()=>{
  const root=mkdtempSync(join(tmpdir(),'vutadex-prod-guard-'));
  const port=await availablePort();
  const server=spawnServer({NODE_ENV:'production',TURSO_DATABASE_URL:'file:'+join(root,'prod.db'),PORT:String(port)});
  try{
    let ok=false;
    for(let i=0;i<100;i++){
      if(server.exitCode!==null)break;
      try{const r=await fetch(`http://127.0.0.1:${port}/api/v1/health`);if(r.ok){ok=true;break;}}catch{}
      await new Promise(done=>setTimeout(done,50));
    }
    assert.ok(ok,'server serves /api/v1/health with a configured backend in production');
  }finally{
    server.kill();rmSync(root,{recursive:true,force:true});
  }
});
