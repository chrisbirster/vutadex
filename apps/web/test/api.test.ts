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

test('M4 note editing protects revision and ownership',async()=>{
  const a=await session('m4-edit@example.com');
  const made=await request('/decks','POST',{name:'M4 Edit'},a.cookie);
  assert.equal(made.status,201);
  const deckId=(await made.json() as {deck:{id:string}}).deck.id;
  const newNote=await request('/notes','POST',{deckId,type:'reverse',front:'France',back:'Paris',tags:'geography'},a.cookie);
  assert.equal(newNote.status,201);
  const id=(await newNote.json() as {note:{id:string}}).note.id;
  const edit=await request('/notes/'+id,'PUT',{type:'reverse',front:'Italy',back:'Rome',tags:'capital',revision:0},a.cookie);
  assert.equal(edit.status,200);
  assert.equal((await edit.json() as {note:{revision:number}}).note.revision,1);
  assert.equal((await request('/notes/'+id,'PUT',{type:'basic',front:'Bad',back:'Old',tags:'',revision:0},a.cookie)).status,409);
  assert.equal((await request('/notes/'+id,'GET',undefined,a.cookie)).status,200);
  const stranger=await session('m4-edit-other@example.com');
  assert.equal((await request('/notes/'+id,'GET',undefined,stranger.cookie)).status,404);
  assert.equal((await request('/notes/'+id,'PUT',{type:'basic',front:'X',back:'Y',tags:'',revision:1},stranger.cookie)).status,404);
});
test('M4 portable import preview, export and no partial imported deck on invalid input',async()=>{
  const a=await session('m4-import@example.com');
  const contents=[
    JSON.stringify({kind:'deck',format:'plandalf.deck',version:2,name:'Imported M4'}),
    JSON.stringify({kind:'note',note_type:'reverse',fields:['France','Paris'],tags_json:'["geography"]'})
  ].join('\n')+'\n';
  const preview=await request('/import/preview','POST',{format:'deck',content:contents},a.cookie);
  assert.equal(preview.status,200);
  assert.equal((await preview.json() as {cards:number}).cards,2);
  const bad=await request('/import','POST',{format:'deck',content:contents+'{"kind":"review","rating":4}\n'},a.cookie);
  assert.equal(bad.status,400);
  const before=await (await request('/decks','GET',undefined,a.cookie)).json() as {decks:unknown[]};
  assert.equal(before.decks.length,0);
  const imported=await request('/import','POST',{format:'deck',content:contents},a.cookie);
  assert.equal(imported.status,201);
  const id=(await imported.json() as {deckId:string}).deckId;
  const exported=await request('/decks/'+id+'/export','GET',undefined,a.cookie);
  assert.equal(exported.status,200);
  assert.match(await exported.text(),/"format":"plandalf.deck"/);
  const other=await session('m4-export-other@example.com');
  assert.equal((await request('/decks/'+id+'/export','GET',undefined,other.cookie)).status,404);
});

test('M5 authoritative study intervals, sibling separation, pause, resume and undo',async()=>{
  const a=await session('m5-study@example.com');
  const create=await request('/decks','POST',{name:'M5 Study'},a.cookie);
  assert.equal(create.status,201);
  const deckId=(await create.json() as {deck:{id:string}}).deck.id;
  assert.equal((await request('/notes','POST',{deckId,type:'reverse',front:'red',back:'rouge',tags:''},a.cookie)).status,201);
  assert.equal((await request('/preferences','PUT',{timezone:'America/New_York'},a.cookie)).status,200);
  assert.equal((await request('/preferences','PUT',{timezone:'Invalid/Zone'},a.cookie)).status,400);
  const started=await request('/study','POST',{deckId},a.cookie);
  const id=(await started.json() as {id:string;total:number}).id;
  const first=await (await request('/study/'+id,'GET',undefined,a.cookie)).json() as {card:{id:string};revision:number;total:number;intervals:{rating:number;intervalMs:number}[]};
  assert.equal(first.total,1,'select one sibling per note');
  assert.equal(first.intervals.length,4);
  const paused=await request('/study/'+id+'/pause','POST',{revision:first.revision},a.cookie);
  assert.equal(paused.status,200);
  const current=await (await request('/study/'+id,'GET',undefined,a.cookie)).json() as {revision:number;paused:boolean};
  assert.equal(current.paused,true);
  assert.equal((await request('/study/'+id+'/rate','POST',{rating:3,revision:current.revision,operationId:crypto.randomUUID()},a.cookie)).status,409);
  assert.equal((await request('/study/'+id+'/resume','POST',{revision:current.revision},a.cookie)).status,200);
  const fresh=await (await request('/study/'+id,'GET',undefined,a.cookie)).json() as {revision:number};
  const operationId=crypto.randomUUID();
  const rate=await request('/study/'+id+'/rate','POST',{rating:3,revision:fresh.revision,operationId},a.cookie);
  assert.equal(rate.status,200);
  const follow=await request('/study','POST',{deckId},a.cookie);
  assert.equal((await follow.json() as {total:number}).total,0,'sibling separated for account-local day');
  const undo=await request('/study/'+id+'/undo','POST',{revision:fresh.revision+1},a.cookie);
  assert.equal(undo.status,200);
  assert.equal((await request('/stats','GET',undefined,a.cookie).then(r=>r.json()) as {reviews:unknown[]}).reviews.length,0,'undone review excluded');
  assert.equal((await request('/study','POST',{deckId},a.cookie).then(r=>r.json()) as {total:number}).total,1);
  const other=await session('m5-study-other@example.com');
  assert.equal((await request('/study/'+id+'/undo','POST',{revision:fresh.revision+2},other.cookie)).status,404);
});
test('M5 Again retries remain in durable session instead of double-counting',async()=>{
  const a=await session('m5-retry@example.com');
  const deckId=(await (await request('/decks','POST',{name:'M5 Retry'},a.cookie)).json() as {deck:{id:string}}).deck.id;
  await request('/notes','POST',{deckId,type:'basic',front:'Q',back:'A',tags:''},a.cookie);
  const id=(await (await request('/study','POST',{deckId},a.cookie)).json() as {id:string}).id;
  const before=await (await request('/study/'+id,'GET',undefined,a.cookie)).json() as {revision:number};
  const operationId=crypto.randomUUID();
  const rated=await request('/study/'+id+'/rate','POST',{rating:1,revision:before.revision,operationId},a.cookie);
  assert.equal(rated.status,200);
  assert.equal((await request('/study/'+id+'/rate','POST',{rating:1,revision:before.revision,operationId},a.cookie).then(r=>r.json()) as {duplicate:boolean}).duplicate,true);
  const after=await (await request('/study/'+id,'GET',undefined,a.cookie)).json() as {total:number;position:number;waiting:number};
  assert.equal(after.total,2);assert.equal(after.position,1);assert.ok(after.waiting>0);
});

test('M6 same-account device cursors converge and other accounts cannot read changes',async()=>{
  const first=await session('m6-devices@example.com'),second=await session('m6-devices@example.com'),outsider=await session('m6-outsider@example.com');
  assert.equal(first.user.id,second.user.id);
  const empty=await (await request('/changes?since=0','GET',undefined,second.cookie)).json() as {cursor:number;changes:unknown[]};
  const made=await request('/decks','POST',{name:'M6 shared deck'},first.cookie);assert.equal(made.status,201);
  const id=(await made.json() as {deck:{id:string}}).deck.id;
  const change=await (await request('/changes?since='+empty.cursor,'GET',undefined,second.cookie)).json() as {cursor:number;changes:{kind:string;resource:string;resource_id:string}[]};
  assert.ok(change.changes.some(e=>e.kind==='created'&&e.resource==='deck'&&e.resource_id===id));
  const privateChanges=await (await request('/changes?since=0','GET',undefined,outsider.cookie)).json() as {changes:unknown[]};
  assert.equal(privateChanges.changes.length,0);
  const created=await request('/notes','POST',{deckId:id,type:'basic',front:'Original',back:'One',tags:''},first.cookie);
  const noteId=(await created.json() as {note:{id:string}}).note.id;
  const changed=await request('/notes/'+noteId,'PUT',{type:'basic',front:'Changed on A',back:'One',tags:'',revision:0},first.cookie);
  assert.equal(changed.status,200);
  const stale=await request('/notes/'+noteId,'PUT',{type:'basic',front:'Stale B',back:'Two',tags:'',revision:0},second.cookie);
  assert.equal(stale.status,409);
  const current=await (await request('/notes/'+noteId,'GET',undefined,second.cookie)).json() as {note:{front:string}};
  assert.equal(current.note.front,'Changed on A');
  const increment=await request('/changes?since='+change.cursor,'GET',undefined,second.cookie);
  assert.equal(increment.status,200);
  assert.ok(((await increment.json()) as {changes:unknown[]}).changes.length>=2);
  assert.equal((await request('/changes?since=-1','GET',undefined,second.cookie)).status,400);
});
test('M6 authenticated SSE stream replays owned changes and terminates on abort',async()=>{
  const user=await session('m6-stream@example.com');
  const created=await request('/decks','POST',{name:'M6 Stream'},user.cookie);
  assert.equal(created.status,201);
  const controller=new AbortController();
  const response=await fetch(base+'/api/v1/changes/stream?since=0',{headers:{Cookie:user.cookie},signal:controller.signal});
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type')||'',/text\/event-stream/);
  const reader=response.body!.getReader(),decoder=new TextDecoder();
  let content='';
  const started=Date.now();
  try{
    while(!content.includes('event: change')&&Date.now()-started<5000){
      const chunk=await reader.read();
      if(chunk.done)break;
      content+=decoder.decode(chunk.value);
    }
    assert.match(content,/event: change/);
    assert.match(content,/"resource":"deck"/);
  }finally{controller.abort();}
  const outsider=await request('/changes/stream','GET');
  assert.equal(outsider.status,401);
});

test('M6 drafts persist across devices with optimistic revision conflicts and ownership',async()=>{
  const one=await session('m6-draft@example.com');
  const two=await session('m6-draft@example.com');
  const other=await session('m6-draft-other@example.com');
  const empty=await request('/drafts/new','GET',undefined,one.cookie);
  assert.equal((await empty.json() as {draft:unknown}).draft,null);
  const draft={deckId:'',type:'basic',front:'Unsaved question',back:'Unsaved answer',tags:'one'};
  const created=await request('/drafts/new','PUT',{...draft,revision:0},one.cookie);
  assert.equal(created.status,200);
  assert.equal((await created.json() as {revision:number}).revision,1);
  const seen=await (await request('/drafts/new','GET',undefined,two.cookie)).json() as {draft:{front:string;revision:number}};
  assert.equal(seen.draft.front,'Unsaved question');
  assert.equal((await request('/drafts/new','PUT',{...draft,front:'Stale',revision:0},two.cookie)).status,409);
  assert.equal((await request('/drafts/new','GET',undefined,other.cookie).then(r=>r.json()) as {draft:unknown}).draft,null);
  const updated=await request('/drafts/new','PUT',{...draft,front:'Updated by A',revision:1},one.cookie);
  assert.equal(updated.status,200);
  const newRevision=(await updated.json() as {revision:number}).revision;
  assert.equal((await request('/drafts/new','DELETE',{revision:1},two.cookie)).status,409);
  assert.equal((await request('/drafts/new','DELETE',{revision:newRevision},one.cookie)).status,200);
  assert.equal((await request('/drafts/new','GET',undefined,two.cookie).then(r=>r.json()) as {draft:unknown}).draft,null);
  const feed=await (await request('/changes?since=0','GET',undefined,two.cookie)).json() as {changes:{resource:string;kind:string}[]};
  assert.ok(feed.changes.some(e=>e.resource==='draft'&&e.kind==='deleted'));
});

test('M7 statistics follow stored account timezone and exclude undone events',async()=>{
  const user=await session('m7-stats@example.com');
  const set=await request('/preferences','PUT',{timezone:'America/New_York'},user.cookie);
  assert.equal(set.status,200);
  const deckId=(await (await request('/decks','POST',{name:'M7 Stats'},user.cookie)).json() as {deck:{id:string}}).deck.id;
  await request('/notes','POST',{deckId,type:'basic',front:'Why study?',back:'Remember',tags:''},user.cookie);
  const studyId=(await (await request('/study','POST',{deckId},user.cookie)).json() as {id:string}).id;
  const card=(await (await request('/study/'+studyId,'GET',undefined,user.cookie)).json()) as {revision:number};
  const op=crypto.randomUUID();
  assert.equal((await request('/study/'+studyId+'/rate','POST',{rating:3,revision:card.revision,operationId:op},user.cookie)).status,200);
  const stats=await (await request('/stats','GET',undefined,user.cookie)).json() as {timezone:string;reviews:{day:string}[];forecast:{day:string;due:number}[]};
  assert.equal(stats.timezone,'America/New_York');
  assert.equal(stats.reviews.length,1);
  assert.match(stats.reviews[0]!.day,/^\d{4}-\d{2}-\d{2}$/);
  assert.ok(Array.isArray(stats.forecast));
  const overview=await (await request('/overview','GET',undefined,user.cookie)).json() as {timezone:string};
  assert.equal(overview.timezone,'America/New_York');
  assert.equal((await request('/study/'+studyId+'/undo','POST',{revision:card.revision+1},user.cookie)).status,200);
  const updated=await (await request('/stats','GET',undefined,user.cookie)).json() as {reviews:unknown[]};
  assert.equal(updated.reviews.length,0);
});

test('M9 independent server processes share durable auth, changes and reject concurrent reviews',async()=>{
  const user=await session('m9-shared@example.com');
  const secondPort=await availablePort(),secondaryBase='http://127.0.0.1:'+secondPort;
  const second=spawn(process.execPath,['--experimental-strip-types',resolve(import.meta.dirname,'../server/index.ts')],{
    cwd:resolve(import.meta.dirname,'..'),
    env:{...process.env,PORT:String(secondPort),APP_ORIGIN:origin,VUTADEX_DB:join(root,'test.db'),NODE_ENV:'test',LOG_LEVEL:'silent'},
    stdio:['ignore','ignore','pipe']
  });
  let stderr='';
  second.stderr?.on('data',(part:Buffer)=>{stderr+=part.toString('utf8');});
  const remote=async(path:string,method='GET',body?:unknown,cookie?:string)=>fetch(secondaryBase+'/api/v1'+path,{
    method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body!==undefined?{'content-type':'application/json'}:{})},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  try{
    let ready=false;
    for(let i=0;i<100;i++){
      if(second.exitCode!==null)throw new Error('Second process failed: '+stderr);
      try{const result=await remote('/health');if(result.ok){ready=true;break;}}catch{}
      await new Promise(done=>setTimeout(done,50));
    }
    assert.ok(ready,'Second process did not become ready: '+stderr);
    assert.equal((await remote('/session','GET',undefined,user.cookie)).status,200,
      'Session must survive across independent Express processes');
    const deck=(await (await request('/decks','POST',{name:'M9 Multiprocess'},user.cookie)).json() as {deck:{id:string}}).deck;
    const reflected=await (await remote('/decks','GET',undefined,user.cookie)).json() as {decks:{id:string}[]};
    assert.ok(reflected.decks.some(d=>d.id===deck.id));
    await request('/notes','POST',{deckId:deck.id,type:'basic',front:'M9 Q',back:'M9 A',tags:''},user.cookie);
    const studyId=(await (await request('/study','POST',{deckId:deck.id},user.cookie)).json() as {id:string}).id;
    const current=await (await request('/study/'+studyId,'GET',undefined,user.cookie)).json() as {revision:number};
    const body1={rating:3,revision:current.revision,operationId:crypto.randomUUID()};
    const body2={rating:2,revision:current.revision,operationId:crypto.randomUUID()};
    const [first,secondRating]=await Promise.all([
      request('/study/'+studyId+'/rate','POST',body1,user.cookie),
      remote('/study/'+studyId+'/rate','POST',body2,user.cookie)
    ]);
    assert.deepEqual([first.status,secondRating.status].sort((a,b)=>a-b),[200,409]);
    const result=await (await remote('/stats','GET',undefined,user.cookie)).json() as {reviews:unknown[]};
    assert.equal(result.reviews.length,1,'A concurrent rating cannot double-commit');
    const changes=await (await remote('/changes?since=0','GET',undefined,user.cookie)).json() as {changes:{kind:string}[]};
    assert.ok(changes.changes.some(c=>c.kind==='reviewed'));
  }finally{
    if(second.exitCode===null){
      await new Promise<void>(resolveDone=>{
        second.once('exit',()=>resolveDone());
        second.kill('SIGTERM');
      });
    }
  }
});

test('M4 advanced notes persist CLI-compatible field arrays and retain stable generated card IDs',async()=>{
  const user=await session('advanced-notes@example.com');
  const deck=(await (await request('/decks','POST',{name:'Advanced Cards'},user.cookie)).json() as {deck:{id:string}}).deck.id;
  const choices=JSON.stringify([{id:'a',text:'Paris'},{id:'b',text:'London'}]);
  const body={deckId:deck,type:'multiple-choice',fields:['Capital of France?',choices,'a','Explanation'],tags:'geography'};
  const created=await request('/notes','POST',body,user.cookie);
  assert.equal(created.status,201);
  const note=(await created.json() as {note:{id:string};generatedCards:number});
  assert.equal(note.generatedCards,1);
  const fetched=await (await request('/notes/'+note.note.id,'GET',undefined,user.cookie)).json() as {note:{fields:string[]}};
  assert.deepEqual(fetched.note.fields,body.fields);
  const imported=await request('/decks/'+deck+'/export','GET',undefined,user.cookie);
  assert.equal(imported.status,200);
  assert.match(await imported.text(),/"note_type":"multiple-choice"/);
  const edit=await request('/notes/'+note.note.id,'PUT',{...body,revision:0,fields:['Capital of Italy?',choices,'b','']},user.cookie);
  assert.equal(edit.status,200);
  assert.equal((await request('/notes/'+note.note.id,'GET',undefined,user.cookie).then(r=>r.json()) as {note:{revision:number}}).note.revision,1);
  const malformed=await request('/notes','POST',{deckId:deck,type:'multiple-select',fields:['Prompt',choices,'["unknown"]',''],tags:''},user.cookie);
  assert.equal(malformed.status,400);
  const preview=await request('/import/preview','POST',{format:'deck',content:[
    JSON.stringify({kind:'deck',format:'plandalf.deck',version:2,name:'Advanced Import'}),
    JSON.stringify({kind:'note',note_type:'ordering',fields:['Order',choices,''],tags_json:'[]'})
  ].join('\n')},user.cookie);
  assert.equal(preview.status,200);
});

test('owned images reject foreign access, script payloads and prune only unreferenced bytes',async()=>{
  const owner=await session('media-owner@example.com'),other=await session('media-other@example.com');
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';
  const bad=await request('/media','POST',{data:Buffer.from('<svg onload="alert(1)"/>').toString('base64')},owner.cookie);
  assert.equal(bad.status,400);
  const uploaded=await request('/media','POST',{data:png},owner.cookie);
  assert.equal(uploaded.status,201);
  const meta=(await uploaded.json()) as {ref:string;sha256:string;mime:string};
  assert.equal(meta.mime,'image/png');
  assert.equal((await request('/media/'+meta.sha256,'GET',undefined,other.cookie)).status,404);
  const read=await request('/media/'+meta.sha256,'GET',undefined,owner.cookie);
  assert.equal(read.status,200);
  assert.match(read.headers.get('content-type')||'',/image\/png/);
  assert.equal(read.headers.get('x-content-type-options'),'nosniff');
  const masks=JSON.stringify([{id:1,x:0.1,y:0.1,width:0.3,height:0.3,answer:'Brain'}]);
  const deck=(await (await request('/decks','POST',{name:'Image Notes'},owner.cookie)).json() as {deck:{id:string}}).deck.id;
  assert.equal((await request('/notes','POST',{deckId:deck,type:'image-occlusion',fields:[meta.ref,masks,''],tags:''},other.cookie)).status,404);
  assert.equal((await request('/notes','POST',{deckId:deck,type:'image-occlusion',fields:[meta.ref,masks,''],tags:''},owner.cookie)).status,201);
  const preview=await request('/import/preview','POST',{format:'deck',content:[
    JSON.stringify({kind:'deck',format:'plandalf.deck',version:2,name:'Bad Media Import'}),
    JSON.stringify({kind:'note',note_type:'image-occlusion',fields:[meta.ref,masks,''],tags_json:'[]'})
  ].join('\n')},owner.cookie);
  assert.equal(preview.status,400);
  const prune=await request('/media/prune','POST',{dryRun:true},owner.cookie);
  assert.equal(prune.status,200);
  assert.deepEqual((await prune.json() as {orphans:string[]}).orphans,[]);
});

test('full-history migration requires verified account confirmation, preserves undo provenance, and is idempotent',async()=>{
  const user=await session('history-owner@example.com'),stranger=await session('history-stranger@example.com');
  const sourceId='cli_personal_2026';
  const bundle={
    format:'vutadex.full-history',version:1,sourceId,schedulerVersion:'fsrs-7-vutadex-1',
    decks:[{id:1,name:'Legacy',description:null}],
    notes:[{id:10,deckId:1,type:'basic',fields:['Old prompt','Old answer'],tags:[]}],
    cards:[{id:40,deckId:1,noteId:10,key:'note:10:template:0',front:'Old prompt',back:'Old answer'}],
    schedules:[{cardId:40,stability:10,difficulty:4,fastStability:1,lastReviewAt:'2026-10-20T12:00:00Z',dueAt:'2026-11-20T12:00:00Z',reviewCount:1,schedulerVersion:'fsrs-7-vutadex-1'}],
    events:[
      {id:70,cardId:40,eventType:'review',rating:3,occurredAt:'2026-10-20T12:00:00Z',undoneReviewId:null,raw:{id:70,event_type:'review'}},
      {id:71,cardId:40,eventType:'undo',rating:null,occurredAt:'2026-10-20T12:01:00Z',undoneReviewId:70,raw:{id:71,event_type:'undo'}}
    ]
  };
  const preview=await request('/migration/full/preview','POST',{bundle},user.cookie);
  assert.equal(preview.status,200);
  assert.equal((await preview.json() as {summary:{reviews:number;undos:number}}).summary.undos,1);
  assert.equal((await request('/migration/full/commit','POST',{bundle},user.cookie)).status,400);
  const imported=await request('/migration/full/commit','POST',{bundle,confirmation:'IMPORT_MY_HISTORY'},user.cookie);
  assert.equal(imported.status,201);
  const second=await request('/migration/full/commit','POST',{bundle,confirmation:'IMPORT_MY_HISTORY'},user.cookie);
  assert.equal(second.status,200);
  assert.equal((await second.json() as {duplicate:boolean}).duplicate,true);
  const conflicting=await request('/migration/full/commit','POST',{bundle:{...bundle,decks:[{...bundle.decks[0],name:'Edited'}]},confirmation:'IMPORT_MY_HISTORY'},user.cookie);
  assert.equal(conflicting.status,409);
  const status=await request('/migration/full/'+sourceId,'GET',undefined,user.cookie);
  assert.equal(status.status,200);
  assert.equal((await request('/migration/full/'+sourceId,'GET',undefined,stranger.cookie)).status,404);
  const decks=await (await request('/decks','GET',undefined,user.cookie)).json() as {decks:{name:string}[]};
  assert.equal(decks.decks.filter(d=>d.name.includes('cli_personal_2026')).length,1);
  const stats=await (await request('/stats','GET',undefined,user.cookie)).json() as {reviews:unknown[]};
  assert.equal(stats.reviews.length,0,'historical undo excludes the imported review from active stats');
});
test('full-history broken references fail before any account data is written',async()=>{
  const user=await session('history-corrupt@example.com');
  const bad={format:'vutadex.full-history',version:1,sourceId:'bad_legacy',schedulerVersion:'fsrs-7-vutadex-1',
    decks:[{id:1,name:'Broken',description:null}],notes:[],cards:[{id:2,deckId:99,noteId:null,key:null,front:'Q',back:'A'}],schedules:[],events:[]};
  assert.equal((await request('/migration/full/preview','POST',{bundle:bad},user.cookie)).status,400);
  assert.equal((await request('/migration/full/commit','POST',{bundle:bad,confirmation:'IMPORT_MY_HISTORY'},user.cookie)).status,400);
  assert.equal((await request('/decks','GET',undefined,user.cookie).then(r=>r.json()) as {decks:unknown[]}).decks.length,0);
});

test('mature retention counts real eligible due reviews and bounded active study time',async()=>{
  const account=await session('mature@example.com');
  const deckId=(await (await request('/decks','POST',{name:'Mature Review'},account.cookie)).json() as {deck:{id:string}}).deck.id;
  assert.equal((await request('/notes','POST',{deckId,type:'basic',front:'Old Q',back:'Old A',tags:''},account.cookie)).status,201);
  const {DatabaseSync}=await import('node:sqlite');
  const local=new DatabaseSync(join(root,'test.db'));
  try{
    const previous=Date.now()-3*86400000,due=Date.now()-86400000;
    local.prepare('UPDATE cards SET review_count=2,stability=5,difficulty=4,fast_stability=2,last_review_at=?,due_at=? WHERE owner_id=?')
      .run(previous,due,account.user.id);
  }finally{local.close();}
  const id=(await (await request('/study','POST',{deckId},account.cookie)).json() as {id:string}).id;
  const reviewSession=await (await request('/study/'+id,'GET',undefined,account.cookie)).json() as {revision:number};
  assert.equal((await request('/study/'+id+'/rate','POST',{rating:3,revision:reviewSession.revision,operationId:crypto.randomUUID()},account.cookie)).status,200);
  const stats=await (await request('/stats','GET',undefined,account.cookie)).json() as {matureRetention:{eligible:number;recalled:number;observedPercent:number}};
  assert.equal(stats.matureRetention.eligible,1);
  assert.equal(stats.matureRetention.recalled,1);
  assert.equal(stats.matureRetention.observedPercent,100);
  assert.equal((await request('/study/'+id+'/activity','POST',{durationMs:16000,eventId:crypto.randomUUID()},account.cookie)).status,400);
  const eventId=crypto.randomUUID();
  assert.equal((await request('/study/'+id+'/activity','POST',{durationMs:15000,eventId},account.cookie)).status,200);
  const replay=await request('/study/'+id+'/activity','POST',{durationMs:15000,eventId},account.cookie);
  assert.equal((await replay.json() as {duplicate:boolean}).duplicate,true);
  const current=await (await request('/stats','GET',undefined,account.cookie)).json() as {activeStudyMs:number};
  assert.equal(current.activeStudyMs,15000);
});

test('portable owned image backup survives export and atomic restore across accounts',async()=>{
  const first=await session('portable-export@example.com'),second=await session('portable-import@example.com');
  const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';
  const upload=await request('/media','POST',{data:image},first.cookie);
  assert.equal(upload.status,201);
  const {ref,sha256}=await upload.json() as {ref:string;sha256:string};
  const name='Portable '+Date.now();
  const deckId=(await (await request('/decks','POST',{name},first.cookie)).json() as {deck:{id:string}}).deck.id;
  const masks=JSON.stringify([{id:7,x:0.15,y:0.2,width:0.3,height:0.4,answer:'Cat'}]);
  const saved=await request('/notes','POST',{deckId,type:'image-occlusion',fields:[ref,masks,'Details'],tags:'pet'},first.cookie);
  assert.equal(saved.status,201);
  assert.equal((await request('/decks/'+deckId+'/portable','GET',undefined,second.cookie)).status,404);
  const exportResult=await request('/decks/'+deckId+'/portable','GET',undefined,first.cookie);
  assert.equal(exportResult.status,200);
  const archive=await exportResult.json() as {media:{hash:string;base64:string}[];notes:{type:string;fields:string[]}[]};
  assert.equal(archive.media[0]?.hash,sha256);
  assert.equal(archive.notes[0]?.fields[1],masks);
  const preview=await request('/portable/preview','POST',{bundle:archive},second.cookie);
  assert.equal(preview.status,200);
  assert.equal((await preview.json() as {assets:number;cards:number}).cards,1);
  const tampered={...archive,media:[{...archive.media[0]!,base64:image.slice(0,-4)+'AAAA'}]};
  assert.equal((await request('/portable/import','POST',{bundle:tampered,confirmation:'IMPORT_PORTABLE'},second.cookie)).status,400);
  assert.equal((await request('/decks','GET',undefined,second.cookie).then(r=>r.json()) as {decks:unknown[]}).decks.length,0);
  const imported=await request('/portable/import','POST',{bundle:archive,confirmation:'IMPORT_PORTABLE'},second.cookie);
  assert.equal(imported.status,201);
  const id=(await imported.json() as {deckId:string}).deckId;
  const downloaded=await request('/media/'+sha256,'GET',undefined,second.cookie);
  assert.equal(downloaded.status,200);
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),Buffer.from(image,'base64'));
  const restored=await (await request('/decks/'+id,'GET',undefined,second.cookie)).json() as {notes:{fields:string[]}[]};
  assert.equal(restored.notes[0]?.fields[1],masks);
  assert.equal((await request('/portable/import','POST',{bundle:archive,confirmation:'IMPORT_PORTABLE'},second.cookie)).status,409);
});
test('study serves owned typed-answer and occlusion presentations with stable review authorization',async()=>{
  const user=await session('study-typed-occlusion@example.com');
  const other=await session('study-type-outsider@example.com');
  const deckId=(await (await request('/decks','POST',{name:'Study Interactions'},user.cookie)).json() as {deck:{id:string}}).deck.id;
  const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';
  const {ref,sha256}=(await (await request('/media','POST',{data:image},user.cookie)).json()) as {ref:string;sha256:string};
  const masks=JSON.stringify([{id:9,x:0.1,y:0.2,width:0.3,height:0.3,answer:'Bongo'}]);
  assert.equal((await request('/notes','POST',{deckId,type:'image-occlusion',fields:[ref,masks,''],tags:''},user.cookie)).status,201);
  const studyId=(await (await request('/study','POST',{deckId},user.cookie)).json() as {id:string}).id;
  const first=await (await request('/study/'+studyId,'GET',undefined,user.cookie)).json() as {card:{presentation:{kind:string;imageHash:string;mask:{id:number};otherMasks:unknown[]};back:string};revision:number};
  assert.equal(first.card.presentation.kind,'image-occlusion');
  assert.equal(first.card.presentation.imageHash,sha256);
  assert.equal(first.card.presentation.mask.id,9);
  assert.ok(!JSON.stringify(first.card.presentation).includes('Bongo'));
  assert.equal((await request('/study/'+studyId,'GET',undefined,other.cookie)).status,404);
  assert.equal((await request('/study/'+studyId+'/rate','POST',{revision:first.revision,rating:3,operationId:crypto.randomUUID()},user.cookie)).status,200);

  const typedDeck=(await (await request('/decks','POST',{name:'Typed Interactions'},user.cookie)).json() as {deck:{id:string}}).deck.id;
  assert.equal((await request('/notes','POST',{deckId:typedDeck,type:'type-answer',fields:['Capital of France?','Paris'],tags:''},user.cookie)).status,201);
  const secondId=(await (await request('/study','POST',{deckId:typedDeck},user.cookie)).json() as {id:string}).id;
  const second=await (await request('/study/'+secondId,'GET',undefined,user.cookie)).json() as {card:{presentation:{kind:string};back:string}};
  assert.equal(second.card.presentation.kind,'type-answer');
  assert.equal(second.card.back,'Paris');
});
