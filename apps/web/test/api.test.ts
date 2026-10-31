import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

const root = mkdtempSync(join(tmpdir(), 'vutadex-web-api-'));
const origin = 'http://127.0.0.1:5173';
let server: ChildProcess;
let serverStderr = '';
let base: string;

async function availablePort():Promise<number> {
  return await new Promise((accept,reject) => {
    const s=createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{
      const address=s.address();
      if(!address || typeof address==='string') {reject(new Error('Invalid test port'));return;}
      const port=address.port;s.close(()=>accept(port));
    });
  });
}
async function start(): Promise<void> {
  const port=await availablePort();base='http://127.0.0.1:'+port;
  server=spawn(process.execPath,['--experimental-strip-types',resolve(import.meta.dirname,'../server/index.ts')],{
    cwd:resolve(import.meta.dirname,'..'),env:{...process.env,PORT:String(port),APP_ORIGIN:origin,VUTADEX_DB:join(root,'test.db'),NODE_ENV:'test',LOG_LEVEL:'silent'},stdio:['ignore','ignore','pipe']
  });
  server.stderr?.on('data',(part:Buffer)=>{serverStderr += part.toString('utf8');});
  let error:unknown;
  for(let i=0;i<100;i++){
    if(server.exitCode!==null)throw new Error('Server exited prematurely: '+serverStderr);
    try{const response=await fetch(base+'/api/v1/health');if(response.ok)return;}catch(e){error=e;}
    await new Promise(done=>setTimeout(done,50));
  }
  throw new Error('API did not start: '+String(error)+' / '+serverStderr);
}
async function request(path:string,method='GET',body?:unknown,cookie?:string,withOrigin=true){
  return await fetch(base+'/api/v1'+path,{method,headers:{...(withOrigin?{Origin:origin}:{}),...(cookie?{Cookie:cookie}:{}),...(body!==undefined?{'content-type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});
}
async function session(email:string){
  const requested=await request('/auth/magic-links','POST',{email});assert.equal(requested.status,200);
  const items=await (await request('/dev/inbox')).json() as {email:string;link:string}[];
  const url=new URL(items.at(-1)!.link);
  const token=new URLSearchParams(url.hash.slice(1)).get('token');
  assert.ok(token);
  const confirmed=await request('/auth/magic-links/consume','POST',{token});
  assert.equal(confirmed.status,200);
  const cookie=confirmed.headers.get('set-cookie')!.split(';')[0]!;
  const user=(await confirmed.json() as {user:{id:string}});
  return {cookie,user:user.user};
}
before(start);
after(()=>{server?.kill();rmSync(root,{recursive:true,force:true});});

test('same-origin protection and persistent database sessions',async()=>{
  const invalid=await request('/auth/magic-links','POST',{email:'a@example.com'},undefined,false);
  assert.equal(invalid.status,403);
  const initial=await request('/session');
  assert.equal(initial.status,401);
  const first=await session('same@example.com');
  const second=await session('same@example.com');
  assert.equal(first.user.id,second.user.id);
  assert.notEqual(first.cookie,second.cookie);
  assert.equal((await request('/session','GET',undefined,first.cookie)).status,200);
  assert.equal((await request('/session','GET',undefined,second.cookie)).status,200);
  const result=await request('/logout','POST',{},first.cookie);
  assert.equal(result.status,200);
  assert.equal((await request('/session','GET',undefined,first.cookie)).status,401);
  assert.equal((await request('/session','GET',undefined,second.cookie)).status,200);
});

test('account ownership, note generation and idempotent rated session',async()=>{
  const alpha=await session('alpha@example.com'),beta=await session('beta@example.com');
  const made=await request('/decks','POST',{name:'Test Philosophy',description:'private'},alpha.cookie);
  assert.equal(made.status,201);
  const {deck}=await made.json() as {deck:{id:string}};
  assert.equal((await request('/decks/'+deck.id,'GET',undefined,beta.cookie)).status,404);
  const forbidden=await request('/notes','POST',{deckId:deck.id,type:'basic',front:'Q',back:'A'},beta.cookie);
  assert.equal(forbidden.status,404);
  const newNote=await request('/notes','POST',{deckId:deck.id,type:'reverse',front:'France',back:'Paris'},alpha.cookie);
  assert.equal(newNote.status,201);
  assert.equal((await newNote.json() as {generatedCards:number}).generatedCards,2);
  const overview=await (await request('/overview','GET',undefined,alpha.cookie)).json() as {cards:number;due:number};
  assert.equal(overview.cards,2);assert.equal(overview.due,2);
  const study=await request('/study','POST',{deckId:deck.id},alpha.cookie);
  assert.equal(study.status,201);
  const id=(await study.json() as {id:string}).id;
  const current=await (await request('/study/'+id,'GET',undefined,alpha.cookie)).json() as {revision:number;card:{id:string}};
  assert.ok(current.card);
  assert.equal((await request('/study/'+id,'GET',undefined,beta.cookie)).status,404);
  const operationId='op-'+crypto.randomUUID();
  const rated=await request('/study/'+id+'/rate','POST',{rating:3,revision:current.revision,operationId},alpha.cookie);
  assert.equal(rated.status,200);
  const repeated=await request('/study/'+id+'/rate','POST',{rating:3,revision:current.revision,operationId},alpha.cookie);
  assert.equal(repeated.status,200);
  assert.equal((await repeated.json() as {duplicate:boolean}).duplicate,true);
  const stale=await request('/study/'+id+'/rate','POST',{rating:3,revision:current.revision,operationId:'op-other'},alpha.cookie);
  assert.equal(stale.status,409);
  const stats=await (await request('/stats','GET',undefined,alpha.cookie)).json() as {reviews:unknown[]};
  assert.equal(stats.reviews.length,1);
  const other=await (await request('/overview','GET',undefined,beta.cookie)).json() as {cards:number};
  assert.equal(other.cards,0);
});

test('one-time magic link cannot be replayed and supports explicit revocation', async()=>{
  const email='replay@example.com';
  assert.equal((await request('/auth/magic-links','POST',{email})).status,200);
  const items=await (await request('/dev/inbox')).json() as {email:string;link:string}[];
  const u=new URL(items.at(-1)!.link);
  const secret=new URLSearchParams(u.hash.slice(1)).get('token');
  assert.ok(secret);
  const first=await request('/auth/magic-links/consume','POST',{token:secret});
  assert.equal(first.status,200);
  const repeated=await request('/auth/magic-links/consume','POST',{token:secret});
  assert.equal(repeated.status,400);
  const cookie=first.headers.get('set-cookie')!.split(';')[0]!;
  const entries=await (await request('/sessions','GET',undefined,cookie)).json() as {sessions:{id:string}[]};
  assert.ok(entries.sessions.length);
  const revoked=await request('/sessions/revoke','POST',{id:entries.sessions[0]!.id},cookie);
  assert.equal(revoked.status,200);
  assert.equal((await request('/session','GET',undefined,cookie)).status,401);
});
test('email local part is not rewritten and domain is canonicalized',async()=>{
  const email='Test+one@EXAMPLE.com';
  assert.equal((await request('/auth/magic-links','POST',{email})).status,200);
  const items=await (await request('/dev/inbox')).json() as {email:string;link:string}[];
  assert.equal(items.at(-1)!.email,'Test+one@example.com');
});
