import express, { type Request, type Response, type NextFunction } from 'express';
import pino from 'pino';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { db, transaction } from './db.ts';
import { mailConfig, sendViaSes } from './email.ts';
import { ContentError, validateNote, generateVariants, parseDeckFile, parseCsv, serializeDeckFile, type NotePayload, type ImportedDeck } from './content.ts';
import { nextMemoryState, nextIntervalDays, type Rating, type MemoryState } from '../../../fsrs/algorithm.ts';
import { FSRS_VERSION } from '../../../fsrs/parameters.ts';

const app = express();
const logger = pino({ level: process.env.LOG_LEVEL || 'info', redact: { paths: ['req.headers.cookie','req.headers.authorization','token','email','url','body'], censor: '[redacted]' } });
const production = process.env.NODE_ENV === 'production';
const origin = process.env.APP_ORIGIN || 'http://127.0.0.1:5173';
const port = Number(process.env.PORT || 3001);
const cookieName = production ? '__Host-vutadex_session' : 'vutadex_session';
const now = () => Date.now();
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const query = <T>(sql: string, ...args: (string | number | null)[]) => db.prepare(sql).get(...args) as T | undefined;
const list = <T>(sql: string, ...args: (string | number | null)[]) => db.prepare(sql).all(...args) as T[];
const run = (sql: string, ...args: (string | number | null)[]) => db.prepare(sql).run(...args);
class ApiError extends Error { readonly status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
function required(value: unknown, name: string, max = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0')) throw new ApiError(400, 'Invalid ' + name);
  return value.trim();
}
function cookies(req: Request): Record<string,string> {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(x => x.trim().split('=').slice(0,2)).filter(x => x.length===2) as [string,string][]);
}
type Account = { id: string; email: string };
function account(req: Request): Account {
  const raw = cookies(req)[cookieName];
  if (!raw) throw new ApiError(401, 'Sign in required');
  const row = query<Account & {last_seen:number;expires_at:number}>('SELECT u.id,u.email,s.last_seen,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?', hash(raw));
  if (!row || row.expires_at < now() || row.last_seen + 30*86400000 < now()) throw new ApiError(401, 'Session expired');
  run('UPDATE sessions SET last_seen=? WHERE token_hash=?',now(),hash(raw));
  return { id: row.id, email: row.email };
}
function sendCookie(res: Response, value: string, age: number) {
  res.cookie(cookieName,value,{httpOnly:true,secure:production,sameSite:'lax',path:'/',maxAge:age});
}
function handler(fn: (req:Request,res:Response)=>unknown) { return (req:Request,res:Response,next:NextFunction) => { try { Promise.resolve(fn(req,res)).catch(next); } catch(e){next(e);} }; }
app.disable('x-powered-by');
app.use((req,res,next)=>{
  const requestId=randomUUID(); res.setHeader('x-request-id', requestId);
  const start=now(); res.on('finish',()=>logger.info({requestId,method:req.method,status:res.statusCode,elapsedMs:now()-start},'http')); next();
});
app.use(express.json({limit:'4mb'}));
app.use((req,res,next)=>{
  if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.path.startsWith('/api/')) {
    // Same-origin protection for all state changes, including login.
    if (req.headers.origin !== origin) { next(new ApiError(403,'Origin not allowed')); return; }
  }
  next();
});
app.get('/api/v1/health',(_req,res)=>res.json({status:'ok'}));
const inbox: {email:string;link:string}[]=[];

function throttle(key:string,max:number,periodMs:number):boolean {
  const time=now();
  return transaction(()=>{
    const row=query<{count:number;reset_at:number}>('SELECT count,reset_at FROM auth_attempts WHERE key=?',key);
    if(!row||row.reset_at<=time){
      run('INSERT INTO auth_attempts(key,count,reset_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,reset_at=excluded.reset_at',key,1,time+periodMs);
      return true;
    }
    if(row.count>=max)return false;
    run('UPDATE auth_attempts SET count=count+1 WHERE key=?',key);
    return true;
  });
}
function canonicalEmail(value:unknown):string{
  const email=required(value,'email',254),at=email.lastIndexOf('@');
  if(at<1||at===email.length-1)throw new ApiError(400,'Enter a valid email');
  // Email local parts retain case, dots and plus-tags; only DNS domains are case-folded.
  const local=email.slice(0,at),domain=email.slice(at+1).toLowerCase();
  if(!/^[^\s@]+$/.test(local)||!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain))throw new ApiError(400,'Enter a valid email');
  return local+'@'+domain;
}
app.post('/api/v1/auth/magic-links',handler(async(req,res)=>{
  const email=canonicalEmail(req.body?.email);
  const ip=req.socket.remoteAddress||'unknown';
  const ipAllowed=throttle('ip:'+hash(ip),30,3600000);
  const emailAllowed=throttle('email:'+hash(email),5,3600000);
  const cooldown=throttle('cooldown:'+hash(email),1,process.env.NODE_ENV==='test'?0:60000);
  if(!ipAllowed||!emailAllowed||!cooldown){res.json({ok:true});return;}
  const secret=token(),digest=hash(secret);
  run('INSERT INTO challenges(token_hash,email,expires_at) VALUES(?,?,?)',digest,email,now()+15*60000);
  const link=origin+'/auth/verify#token='+encodeURIComponent(secret);
  try{
    if(production)await sendViaSes(mailConfig(process.env),email,link);
    else{inbox.push({email,link});if(inbox.length>25)inbox.shift();}
  }catch{
    run('DELETE FROM challenges WHERE token_hash=?',digest);
    throw new ApiError(503,'Email delivery unavailable');
  }
  res.json({ok:true});
}));
// Local-only development inbox; never registered in production.
if(!production) app.get('/api/v1/dev/inbox',(_req,res)=>{
  if (!['127.0.0.1','localhost'].includes(_req.hostname) || !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(_req.socket.remoteAddress||'')) { res.sendStatus(403); return; }
  res.json(inbox);
});
app.post('/api/v1/auth/magic-links/consume',handler((req,res)=>{
  const secret=required(req.body?.token,'token',256);
  const result=transaction(()=>{
    const row=query<{email:string;expires_at:number;consumed_at:number|null}>('SELECT * FROM challenges WHERE token_hash=?',hash(secret));
    if(!row || row.consumed_at !== null || row.expires_at<now()) throw new ApiError(400,'Invalid or expired link');
    run('UPDATE challenges SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL',now(),hash(secret));
    let user=query<Account>('SELECT id,email FROM users WHERE email=?',row.email);
    if(!user){const id=randomUUID(); run('INSERT INTO users(id,email,created_at) VALUES(?,?,?)',id,row.email,now());user={id,email:row.email};}
    const session=token();
    run('INSERT INTO sessions(token_hash,user_id,created_at,last_seen,expires_at) VALUES(?,?,?,?,?)',hash(session),user.id,now(),now(),now()+90*86400000);
    return {user,session};
  });
  sendCookie(res,result.session,90*86400000);res.json({user:result.user});
}));
app.get('/api/v1/session',handler((req,res)=>res.json({user:account(req)})));
app.post('/api/v1/logout',handler((req,res)=>{
  const raw=cookies(req)[cookieName];if(raw)run('DELETE FROM sessions WHERE token_hash=?',hash(raw));
  res.clearCookie(cookieName,{path:'/',secure:production,sameSite:'lax',httpOnly:true});res.json({ok:true});
}));
app.get('/api/v1/sessions',handler((req,res)=>{
  const user=account(req);res.json({sessions:list('SELECT substr(token_hash,1,12) AS id,created_at,last_seen,expires_at FROM sessions WHERE user_id=? ORDER BY last_seen DESC',user.id)});
}));
app.post('/api/v1/sessions/revoke-all',handler((req,res)=>{
  const user=account(req);run('DELETE FROM sessions WHERE user_id=?',user.id);
  res.clearCookie(cookieName,{path:'/',secure:production,sameSite:'lax',httpOnly:true});res.json({ok:true});
}));
app.get('/api/v1/overview',handler((req,res)=>{
  const user=account(req);const t=now();
  const decks=list('SELECT d.id,d.name,d.description,COUNT(c.id) AS cards,COALESCE(SUM(CASE WHEN c.due_at<=? THEN 1 ELSE 0 END),0) AS due FROM decks d LEFT JOIN cards c ON c.deck_id=d.id AND c.owner_id=d.owner_id WHERE d.owner_id=? GROUP BY d.id ORDER BY d.created_at DESC',t,user.id);
  const due=query<{total:number}>('SELECT COUNT(*) AS total FROM cards WHERE owner_id=? AND due_at<=?',user.id,t)?.total||0;
  const cards=query<{total:number}>('SELECT COUNT(*) AS total FROM cards WHERE owner_id=?',user.id)?.total||0;
  const reviews=list('SELECT r.rating,r.created_at,d.name AS deck FROM review_events r JOIN cards c ON c.id=r.card_id JOIN decks d ON d.id=c.deck_id WHERE r.owner_id=? ORDER BY r.created_at DESC LIMIT 200',user.id);
  res.json({decks,due,cards,reviews});
}));
app.get('/api/v1/decks',handler((req,res)=>{
  const user=account(req);res.json({decks:list('SELECT id,name,description,created_at FROM decks WHERE owner_id=? ORDER BY created_at DESC',user.id)});
}));
app.post('/api/v1/decks',handler((req,res)=>{
  const user=account(req);const id=randomUUID();const name=required(req.body?.name,'deck name',120);
  const description=typeof req.body?.description==='string'?req.body.description.slice(0,500):'';
  try { run('INSERT INTO decks(id,owner_id,name,description,created_at) VALUES(?,?,?,?,?)',id,user.id,name,description,now()); }
  catch(e){if(String(e).includes('UNIQUE')) throw new ApiError(409,'Deck name already exists');throw e;}
  res.status(201).json({deck:{id,name,description}});
}));
app.get('/api/v1/decks/:id',handler((req,res)=>{
  const user=account(req);const id=String(req.params.id);
  const deck=query('SELECT id,name,description FROM decks WHERE id=? AND owner_id=?',id,user.id);
  if(!deck)throw new ApiError(404,'Deck not found');
  const notes=list('SELECT id,type,front,back,tags,created_at FROM notes WHERE deck_id=? AND owner_id=? ORDER BY created_at DESC',id,user.id);
  res.json({deck,notes});
}));

function getImportedDeck(body:any):ImportedDeck{
  if(!body||typeof body.content!=='string')throw new ApiError(400,'Missing import content');
  if(body.format==='csv')return parseCsv(body.content,required(body.name,'deck name',120));
  if(body.format==='deck')return parseDeckFile(body.content);
  throw new ApiError(400,'Expected import format deck or csv');
}
function writeNote(owner:string,deckId:string,note:NotePayload,existing?:{id:string;revision:number}) {
  const variants=generateVariants(note),time=now();
  const id=existing?.id||randomUUID();
  if(existing){
    const previous=query<{revision:number}>('SELECT revision FROM notes WHERE id=? AND owner_id=? AND deck_id=?',id,owner,deckId);
    if(!previous)throw new ApiError(404,'Note not found');
    if(previous.revision!==existing.revision)throw new ApiError(409,'Note changed on another device. Reload before saving.');
    run('UPDATE notes SET type=?,front=?,back=?,tags=?,revision=revision+1 WHERE id=? AND owner_id=?',note.type,note.front,note.back,note.tags,id,owner);
  }else{
    run('INSERT INTO notes(id,deck_id,owner_id,type,front,back,tags,created_at) VALUES(?,?,?,?,?,?,?,?)',id,deckId,owner,note.type,note.front,note.back,note.tags,time);
  }
  const current=list<{id:string;variant:string}>('SELECT id,variant FROM cards WHERE note_id=? AND owner_id=?',id,owner);
  const variantsSet=new Set(variants.map(v=>v.name));
  for(const prior of current){
    if(!variantsSet.has(prior.variant))run('UPDATE cards SET retired=1 WHERE id=? AND owner_id=?',prior.id,owner);
  }
  for(const variant of variants) {
    const old=current.find(c=>c.variant===variant.name);
    if(old)run('UPDATE cards SET front=?,back=?,retired=0 WHERE id=? AND owner_id=?',variant.front,variant.back,old.id,owner);
    else run('INSERT INTO cards(id,note_id,deck_id,owner_id,variant,front,back,due_at) VALUES(?,?,?,?,?,?,?,?)',randomUUID(),id,deckId,owner,variant.name,variant.front,variant.back,time);
  }
  return {id,deckId,...note,revision:existing?existing.revision+1:0,generatedCards:variants.length};
}
app.post('/api/v1/notes',handler((req,res)=>{
  const user=account(req),deckId=required(req.body?.deckId,'deck ID',100);
  if(!query('SELECT id FROM decks WHERE id=? AND owner_id=?',deckId,user.id))throw new ApiError(404,'Deck not found');
  const note=validateNote(req.body);
  const saved=transaction(()=>writeNote(user.id,deckId,note));
  res.status(201).json({note:saved,generatedCards:saved.generatedCards});
}));
app.get('/api/v1/notes/:id',handler((req,res)=>{
  const user=account(req);
  const note=query('SELECT id,deck_id AS deckId,type,front,back,tags,revision FROM notes WHERE id=? AND owner_id=?',String(req.params.id),user.id);
  if(!note)throw new ApiError(404,'Note not found');
  res.json({note});
}));
app.put('/api/v1/notes/:id',handler((req,res)=>{
  const user=account(req);
  const id=String(req.params.id);
  const existing=query<{deck_id:string;revision:number}>('SELECT deck_id,revision FROM notes WHERE id=? AND owner_id=?',id,user.id);
  if(!existing)throw new ApiError(404,'Note not found');
  const revision=Number(req.body?.revision);
  if(!Number.isSafeInteger(revision)||revision<0)throw new ApiError(400,'Expected note revision');
  const note=validateNote(req.body);
  const saved=transaction(()=>writeNote(user.id,existing.deck_id,note,{id,revision}));
  res.json({note:saved});
}));
app.post('/api/v1/import/preview',handler((req,res)=>{
  const user=account(req);
  const imported=getImportedDeck(req.body);
  // An account check is mandatory, even for preview, to avoid anonymous parsing/resource usage.
  void user;
  res.json({name:imported.name,notes:imported.notes.length,cards:imported.notes.reduce((n,item)=>n+generateVariants(item).length,0)});
}));
app.post('/api/v1/import',handler((req,res)=>{
  const user=account(req);
  const imported=getImportedDeck(req.body);
  const id=randomUUID();
  try{
    transaction(()=>{
      run('INSERT INTO decks(id,owner_id,name,description,created_at) VALUES(?,?,?,?,?)',id,user.id,imported.name,'Imported content-only deck',now());
      for(const note of imported.notes)writeNote(user.id,id,note);
    });
  }catch(e){if(String(e).includes('UNIQUE'))throw new ApiError(409,'Deck name already exists');throw e;}
  res.status(201).json({deckId:id,notes:imported.notes.length});
}));
app.get('/api/v1/decks/:id/export',handler((req,res)=>{
  const user=account(req),id=String(req.params.id);
  const deck=query<{name:string}>('SELECT name FROM decks WHERE id=? AND owner_id=?',id,user.id);
  if(!deck)throw new ApiError(404,'Deck not found');
  const notes=list<{type:NotePayload['type'];front:string;back:string;tags:string}>('SELECT type,front,back,tags FROM notes WHERE deck_id=? AND owner_id=? ORDER BY created_at,id',id,user.id);
  res.setHeader('content-type','text/plain; charset=utf-8');
  res.setHeader('content-disposition','attachment; filename="vutadex.deck"');
  res.send(serializeDeckFile({name:deck.name,notes}));
}));
app.post('/api/v1/study',handler((req,res)=>{
  const user=account(req); const deckId=req.body?.deckId;
  if(deckId!==undefined && (typeof deckId!=='string'||!query('SELECT id FROM decks WHERE id=? AND owner_id=?',deckId,user.id)))throw new ApiError(404,'Deck not found');
  const rows=list<{id:string}>('SELECT id FROM cards WHERE owner_id=? AND due_at<=?'+(deckId?' AND deck_id=?':'')+' ORDER BY review_count DESC,due_at ASC LIMIT 100',...(deckId?[user.id,now(),deckId]:[user.id,now()]));
  const id=randomUUID();
  run('INSERT INTO study_sessions(id,owner_id,queue_json,created_at) VALUES(?,?,?,?)',id,user.id,JSON.stringify(rows.map(r=>r.id)),now());
  res.status(201).json({id});
}));
app.get('/api/v1/study/:id',handler((req,res)=>{
  const user=account(req);
  const s=query<{queue_json:string;position:number;revision:number}>('SELECT queue_json,position,revision FROM study_sessions WHERE id=? AND owner_id=?',String(req.params.id),user.id);
  if(!s)throw new ApiError(404,'Study session not found');
  const queue=JSON.parse(s.queue_json) as string[];
  const cardId=queue[s.position];
  const card=cardId?query<{id:string;front:string;back:string;due_at:number}>('SELECT id,front,back,due_at FROM cards WHERE id=? AND owner_id=?',cardId,user.id):null;
  res.json({card:card||null,position:s.position,total:queue.length,revision:s.revision,waiting:card?Math.max(0,card.due_at-now()):0});
}));
app.post('/api/v1/study/:id/rate',handler((req,res)=>{
  const user=account(req),rating=Number(req.body?.rating);
  if(![1,2,3,4].includes(rating))throw new ApiError(400,'Invalid rating');
  const operationId=required(req.body?.operationId,'operation ID',80);
  const expected=Number(req.body?.revision);
  if(!Number.isSafeInteger(expected)||expected<0)throw new ApiError(400,'Invalid revision');
  const result=transaction(()=>{
    // A repeated operation never double-applies a review.
    if(query('SELECT id FROM review_events WHERE id=? AND owner_id=?',operationId,user.id))return {duplicate:true};
    const s=query<{queue_json:string;position:number;revision:number}>('SELECT queue_json,position,revision FROM study_sessions WHERE id=? AND owner_id=?',String(req.params.id),user.id);
    if(!s)throw new ApiError(404,'Study session not found');
    if(s.revision!==expected)throw new ApiError(409,'Session changed elsewhere. Refresh to resume.');
    const queue=JSON.parse(s.queue_json) as string[],id=queue[s.position];
    if(!id)throw new ApiError(409,'Session already complete');
    const card=query<{id:string;stability:number|null;difficulty:number|null;fast_stability:number|null;last_review_at:number|null;review_count:number;due_at:number}>('SELECT * FROM cards WHERE id=? AND owner_id=?',id,user.id);
    if(!card)throw new ApiError(404,'Card not found');
    if(card.due_at>now())throw new ApiError(409,'Card is not ready yet');
    const before:MemoryState|null=card.stability===null||card.difficulty===null||card.fast_stability===null?null:{stability:card.stability,difficulty:card.difficulty,fastStability:card.fast_stability};
    const state=nextMemoryState(before,card.last_review_at===null?0:(now()-card.last_review_at)/86400000,rating as Rating);
    const interval=rating===1?60000:Math.max(60000,Math.round(nextIntervalDays(state)*86400000));
    const time=now();
    run('UPDATE cards SET stability=?,difficulty=?,fast_stability=?,last_review_at=?,review_count=review_count+1,due_at=? WHERE id=? AND owner_id=?',state.stability,state.difficulty,state.fastStability,time,time+interval,id,user.id);
    run('INSERT INTO review_events(id,owner_id,card_id,rating,created_at) VALUES(?,?,?,?,?)',operationId,user.id,id,rating,time);
    if(rating===1)queue.push(id);
    run('UPDATE study_sessions SET queue_json=?,position=position+1,revision=revision+1 WHERE id=? AND owner_id=?',JSON.stringify(queue),String(req.params.id),user.id);
    return {duplicate:false,intervalMs:interval,scheduler:FSRS_VERSION};
  });res.json(result);
}));
app.get('/api/v1/stats',handler((req,res)=>{
  const user=account(req);const reviewHistory=list<{rating:number;created_at:number;deck:string}>('SELECT r.rating,r.created_at,d.name AS deck FROM review_events r JOIN cards c ON r.card_id=c.id JOIN decks d ON c.deck_id=d.id WHERE r.owner_id=? ORDER BY r.created_at DESC LIMIT 5000',user.id);
  res.json({reviews:reviewHistory});
}));
app.use('/api',(_req,res)=>res.status(404).json({error:'Not found'}));
const dist=resolve(import.meta.dirname,'../dist');
if (existsSync(dist)) {app.use(express.static(dist));app.get('/{*path}',(_req,res)=>res.sendFile(resolve(dist,'index.html')));}
app.use((err:unknown,_req:Request,res:Response,_next:NextFunction)=>{
  const status=err instanceof ApiError?err.status:500;
  if(err instanceof ContentError){res.status(400).json({error:err.message});return;}
  if(status===500)logger.error({name:err instanceof Error?err.name:'Error'},'request failed');
  res.status(status).json({error:status===500?'Unexpected server error':(err as Error).message});
});
const server=app.listen(port,'127.0.0.1',()=>logger.info({port},'Vutadex web API listening'));
function shutdown(){server.close(()=>{db.close();process.exit(0);});}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
