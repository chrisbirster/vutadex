import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createRootRoute, createRoute, createRouter, Link, Outlet, RouterProvider, useNavigate, useRouterState } from '@tanstack/react-router';
import { useImmer } from 'use-immer';
import { Home, Layers3, Play, SquarePlus, ChartNoAxesColumnIncreasing, Settings, Search, LogOut, Sparkles, Flame, BookOpen, Plus, ArrowRight, Eye, RotateCcw, Check, Clock, Target, ChevronLeft, ChevronRight, Keyboard, Mail, LoaderCircle, Brain, Menu, X, Download, PanelLeft, CircleHelp } from 'lucide-react';
import {mergeEdits,applySelections,type EditableNote} from './merge.ts';
import {compareTypedAnswer} from './typed-answer.ts';
import './style.css';

type User = {id:string;email:string};
type Deck = {id:string;name:string;description:string;created_at?:number;cards?:number;due?:number};
type Note = {id:string;type:string;front:string;back:string;tags:string;created_at:number;revision:number};
type Review = {rating:number;created_at:number;deck:string;day?:string};
type Overview = {decks:Deck[];due:number;cards:number;timezone:string;reviews:Review[]};
type MaskRect={id:number;x:number;y:number;width:number;height:number};
type StudyPresentation={kind:'text'}|{kind:'type-answer'}|{kind:'image-occlusion';imageHash:string;prompt:string;mask:MaskRect;otherMasks:MaskRect[]};
type Study = {card:{id:string;front:string;back:string;due_at:number;presentation:StudyPresentation}|null;position:number;total:number;revision:number;waiting:number;paused:boolean;intervals:{rating:number;intervalMs:number;dueAt:number}[]};
type SessionState = {user:User|null;loading:boolean;error:string};
type SessionContextValue={session:SessionState;refresh:()=>Promise<void>};
const SessionContext=createContext<SessionContextValue|null>(null);
function broadcastSessionChange(){if(typeof BroadcastChannel!=='undefined'){const c=new BroadcastChannel('vutadex:session');c.postMessage('session-changed');c.close();}}

const AccountChangeContext=createContext(0);
function AccountSyncProvider({owner,refresh,children}:{owner:string;refresh:()=>Promise<void>;children:React.ReactNode}){
  const [state,setState]=useImmer({cursor:0,revision:0,connected:false});
  useEffect(()=>{
    if(!owner)return;
    let closed=false,seq=0;
    let stream:EventSource|null=null;
    const catchup=async()=>{
      try{
        let more=true;
        while(!closed&&more){
          const response=await api<{changes:{seq:number}[];cursor:number;hasMore:boolean}>('/changes?since='+seq);
          if(response.changes.length)setState(d=>{d.revision++;});
          seq=Math.max(seq,response.cursor);more=response.hasMore;
        }
        if(!closed)setState(d=>{d.connected=true;d.cursor=seq;});
      }catch{if(!closed)setState(d=>{d.connected=false;});}
    };
    const setup=async()=>{
      await catchup();if(closed)return;
      stream=new EventSource('/api/v1/changes/stream?since='+seq);
      stream.addEventListener('change',(event:Event)=>{
        const data=JSON.parse((event as MessageEvent<string>).data) as {seq:number};
        if(data.seq<=seq)return;
        seq=data.seq;setState(d=>{d.cursor=seq;d.revision++;d.connected=true;});
      });
      stream.addEventListener('session-expired',()=>{stream?.close();void refresh();});
      stream.onerror=()=>setState(d=>{d.connected=false;});
      stream.onopen=()=>setState(d=>{d.connected=true;});
    };
    void setup();
    const onFocus=()=>{void catchup();};
    const onVisible=()=>{if(document.visibilityState==='visible')void catchup();};
    window.addEventListener('focus',onFocus);
    document.addEventListener('visibilitychange',onVisible);
    return()=>{closed=true;stream?.close();window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onVisible);};
  },[owner,setState]);
  return <AccountChangeContext.Provider value={state.revision}>{children}</AccountChangeContext.Provider>;
}
function useSession(){const value=useContext(SessionContext);if(!value)throw new Error('SessionProvider missing');return value;}
class ApiRequestError extends Error {constructor(readonly status:number,message:string){super(message);}}
async function api<T>(path:string, options?:{method?:string;body?:unknown;signal?:AbortSignal}):Promise<T>{
  const response=await fetch('/api/v1'+path,{method:options?.method||'GET',credentials:'same-origin',signal:options?.signal,headers:options?.body===undefined?{}:{'content-type':'application/json'},body:options?.body===undefined?undefined:JSON.stringify(options.body)});
  let payload:unknown;
  try{payload=await response.json();}catch{throw new Error('Unable to reach Vutadex. Check your connection.');}
  if(!response.ok)throw new ApiRequestError(response.status,typeof payload==='object'&&payload!==null&&'error' in payload?String((payload as {error:unknown}).error):'Request failed');
  return payload as T;
}
function useResource<T>(url:string|null){
  const changeRevision=useContext(AccountChangeContext);
  const [state,setState]=useImmer<{data:T|null;loading:boolean;error:string}>({data:null,loading:!!url,error:''});
  const [refresh,setRefresh]=useState(0);
  const owner=useSession().session.user?.id;
  useEffect(()=>{
    if(!url || !owner){setState({data:null,loading:false,error:''});return;}
    const controller=new AbortController();
    setState({data:null,loading:true,error:''});
    api<T>(url,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setState({data,loading:false,error:''});})
      .catch((error:unknown)=>{if(!controller.signal.aborted)setState({data:null,loading:false,error:String(error)});});
    return ()=>controller.abort();
  },[url,owner,refresh,setState,changeRevision]);
  return {...state,reload:()=>setRefresh(n=>n+1)};
}
const routeRoot=createRootRoute({component:Application,notFoundComponent:()=> <Empty title="Page not found" message="Bongo searched under the couch. Nothing there."/>});
const routeHome=createRoute({getParentRoute:()=>routeRoot,path:'/',component:HomePage});
const routeLogin=createRoute({getParentRoute:()=>routeRoot,path:'/login',component:LoginPage});
const routeVerify=createRoute({getParentRoute:()=>routeRoot,path:'/auth/verify',component:VerifyPage});
const routeDecks=createRoute({getParentRoute:()=>routeRoot,path:'/decks',component:DecksPage});
const routeDeckNew=createRoute({getParentRoute:()=>routeRoot,path:'/decks/new',component:NewDeckPage});
const routeDeckDetail=createRoute({getParentRoute:()=>routeRoot,path:'/decks/$deckId',component:DeckDetailPage});
const routeNoteEdit=createRoute({getParentRoute:()=>routeRoot,path:'/notes/$noteId/edit',component:EditNotePage});
const routeImport=createRoute({getParentRoute:()=>routeRoot,path:'/import',component:ImportPage});
const routePortable=createRoute({getParentRoute:()=>routeRoot,path:'/portable/import',component:PortableImportPage});
const routeHistory=createRoute({getParentRoute:()=>routeRoot,path:'/migration/full',component:HistoryMigrationPage});
const routeCardNew=createRoute({getParentRoute:()=>routeRoot,path:'/cards/new',validateSearch:(search:Record<string,unknown>)=>({deckId:typeof search.deckId==='string'?search.deckId:undefined}),component:CardEditorPage});
const routeStudy=createRoute({getParentRoute:()=>routeRoot,path:'/study',component:StudyStartPage});
const routeStudySession=createRoute({getParentRoute:()=>routeRoot,path:'/study/$sessionId',component:StudySessionPage});
const routeStats=createRoute({getParentRoute:()=>routeRoot,path:'/stats',component:StatsPage});
const routeSettings=createRoute({getParentRoute:()=>routeRoot,path:'/settings',component:SettingsPage});
const routeTree=routeRoot.addChildren([routeHome,routeLogin,routeVerify,routeDecks,routeDeckNew,routeDeckDetail,routeCardNew,routeNoteEdit,routeImport,routePortable,routeHistory,routeStudy,routeStudySession,routeStats,routeSettings]);
const router=createRouter({routeTree,defaultPreload:'intent'});
declare module '@tanstack/react-router' {interface Register {router:typeof router;}}
function Bongo({mood='happy',size='regular'}:{mood?:'happy'|'sleepy'|'thinking'|'hype';size?:'regular'|'large'}){
  return <svg className={'bongo bongo-'+size} viewBox="0 0 260 220" role="img" aria-label={'Bongo the tabby cat, '+mood}>
    <ellipse cx="130" cy="204" rx="98" ry="12" fill="#87bca9" opacity=".25"/>
    <path d="M40 174C35 119 55 97 78 84L64 21Q70 6 96 41L131 34L171 40Q197 5 203 20L188 85C233 114 226 177 210 195C158 213 93 213 46 194Z" fill="#a48c71" stroke="#302b37" strokeWidth="5" strokeLinejoin="round"/>
    <path d="M68 33L76 67L95 53Z M178 51L196 33L188 67Z" fill="#e5b5a4" stroke="#654a43" strokeWidth="2"/>
    <path d="M128 35L124 69M112 38L115 57M146 38L139 59M55 102L83 112M43 126L75 131M208 109L184 119M215 135L185 138M51 163L76 161M208 165L178 161" stroke="#423b3a" strokeWidth="7" strokeLinecap="round"/>
    <path d="M80 166Q54 199 76 202L112 202Q129 189 108 166M156 168Q139 201 161 204L193 202Q217 190 190 164" fill="#b49a7d" stroke="#423b3a" strokeWidth="4"/>
    {mood==='sleepy'? <><path d="M80 112Q100 129 121 111M144 111Q164 128 184 112" fill="none" stroke="#282b34" strokeWidth="5" strokeLinecap="round"/></>:
    <><ellipse cx="100" cy="114" rx="20" ry="24" fill="#efc664" stroke="#3d3433" strokeWidth="3"/><ellipse cx="165" cy="114" rx="20" ry="24" fill="#efc664" stroke="#3d3433" strokeWidth="3"/><ellipse cx="102" cy="114" rx="5" ry="18" fill="#1f242e"/><ellipse cx="163" cy="114" rx="5" ry="18" fill="#1f242e"/><circle cx="95" cy="105" r="5" fill="#fff7d9"/><circle cx="157" cy="104" r="5" fill="#fff7d9"/></>}
    <path d="M117 149Q130 158 143 149L132 145Z" fill="#df9e91" stroke="#3d3433" strokeWidth="3"/>
    <path d="M131 153Q130 166 117 166M131 153Q134 166 148 166" stroke="#3d3433" fill="none" strokeWidth="3" strokeLinecap="round"/>
    <path d="M89 157L46 151M91 167L48 173M170 157L212 151M169 167L213 174" stroke="#4c4442" strokeWidth="2.5" strokeLinecap="round"/>
    {mood==='thinking'&&<text x="217" y="54" fill="#d38c2c" fontSize="31" fontWeight="bold">?</text>}
    {mood==='hype'&&<><path d="M46 39L31 17M223 63L241 43" stroke="#ffb42f" strokeWidth="6" strokeLinecap="round"/><text x="213" y="25" fill="#e5a52d" fontSize="25">✦</text></>}
  </svg>;
}
const NAV=[{to:'/' as const,label:'Home',icon:Home},{to:'/decks' as const,label:'Decks',icon:Layers3},{to:'/study' as const,label:'Study',icon:Play},{to:'/cards/new' as const,label:'Add Cards',icon:SquarePlus},{to:'/stats' as const,label:'Stats',icon:ChartNoAxesColumnIncreasing},{to:'/settings' as const,label:'Settings',icon:Settings}];
function Application(){
  const [session,setSession]=useImmer<SessionState>({user:null,loading:true,error:''});
  const refresh=async()=>{try{const r=await api<{user:User}>('/session');setSession({user:r.user,loading:false,error:''});}catch{setSession({user:null,loading:false,error:''});}};
  useEffect(()=>{void refresh();},[]);
  useEffect(()=>{if(typeof BroadcastChannel==='undefined')return;const c=new BroadcastChannel('vutadex:session');c.onmessage=()=>void refresh();return()=>c.close();},[]);
  const path=useRouterState({select:s=>s.location.pathname});
  const [mobileNav,setMobileNav]=useState(false);
  const authPage=path==='/login'||path==='/auth/verify';
  const navigate=useNavigate();
  useEffect(()=>setMobileNav(false),[path]);
  if(session.loading)return <div className="center-screen"><Bongo/><p>Waking up Bongo...</p></div>;
  if(!session.user&&!authPage)return <LoginPage/>;
  if(authPage)return <SessionContext.Provider value={{session,refresh}}><main className="auth-background"><Outlet/></main></SessionContext.Provider>;
  const signOut=async()=>{await api('/logout',{method:'POST'});broadcastSessionChange();setSession({user:null,loading:false,error:''});void navigate({to:'/login'});};
  return <SessionContext.Provider value={{session,refresh}}>
    <AccountSyncProvider owner={session.user?.id||''} refresh={refresh}><div className="app">
      <aside className={'sidebar '+(mobileNav?'sidebar-open':'')}>
        <div className="brand"><div className="brand-mark"><Layers3 size={27}/></div><div><strong>Vutadex</strong><small>Memories that actually stick<br/>(and occasionally make you laugh)</small></div></div>
        <nav aria-label="Main navigation">{NAV.map(item=><Link key={item.label} to={item.to} activeOptions={{exact:item.to==='/'}} className="nav-link" activeProps={{className:'nav-link active'}}><item.icon size={21} strokeWidth={2.3}/><span>{item.label}</span></Link>)}</nav>
        <div className="sidebar-mascot"><Bongo mood="sleepy"/><p className="scribble">GOOD CARDS.<br/>BETTER HUMANS.</p><p className="quiet">A slightly smarter you,<br/>one card at a time.</p></div>
      </aside>
      {mobileNav&&<button className="mobile-scrim" aria-label="Close navigation" onClick={()=>setMobileNav(false)} />}
      <div className="main-shell">
        <header className="topbar"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={()=>setMobileNav(true)}><Menu/></button><Link to="/" className="mobile-logo">Vutadex</Link><div className="search-shell"><Search size={20}/><input aria-label="Find decks" placeholder="Search decks, cards, or existential questions..." onKeyDown={e=>{if(e.key==='Enter'&&e.currentTarget.value.trim())void navigate({to:'/decks',search:undefined});}}/><kbd>⌘ K</kbd></div><div className="avatar"><div className="avatar-cat"><Bongo/></div><div><strong>{session.user?.email.split('@')[0]||'Learner'}</strong><small>More cards. Less forgetting.</small></div></div><button className="icon-button logout" onClick={()=>void signOut()} aria-label="Sign out" title="Sign out"><LogOut size={19}/></button></header>
        <main className="content"><Outlet/></main>
      </div>
    </div></AccountSyncProvider>
  </SessionContext.Provider>;
}
function Empty({title,message,action}:{title:string;message:string;action?:React.ReactNode}){return <div className="empty card"><Bongo mood="thinking"/><h2>{title}</h2><p>{message}</p>{action}</div>;}
function Notice({text}:{text:string}){return text?<div className="notice" role="alert">{text}</div>:null;}
function Heading({title,subtitle,mood='happy'}:{title:string;subtitle:string;mood?:'happy'|'sleepy'|'thinking'|'hype'}){return <section className="hero"><div><h1>{title}</h1><p>{subtitle}</p></div><div className="hero-cat"><Bongo mood={mood} size="large"/></div></section>;}
function Tile({icon:Icon,label,value,tone='mint',hint}:{icon:typeof Home;label:string;value:string|number;tone?:string;hint?:string}){return <div className={'metric metric-'+tone}><Icon size={25}/><div><strong>{value}</strong><span>{label}</span>{hint&&<small>{hint}</small>}</div></div>;}
function HomePage(){
  const {data,loading,error}=useResource<Overview>('/overview');
  const navigate=useNavigate();
  if(loading)return <Loading/>;if(error)return <Notice text={error}/>;
  const overview=data!;
  const streak=computeStreak(overview.reviews,overview.timezone);
  return <><section className="hero hero-main"><div><span className="eyebrow">THE KNOWLEDGE GOBLIN APPROACHES</span><h1>{overview.due?'Due cards are lurking.':'Your brain is ready.'}</h1><p>{overview.due?overview.due+' cards have been waiting for you.':'Create a deck and start collecting brain gains.'}</p><div className="actions"><button className="primary" onClick={()=>void startStudy(navigate)}><Play size={19} fill="currentColor"/> Study Now</button><Link className="button secondary" to="/cards/new" search={{deckId:undefined}}><Plus size={20}/> Add Chaos</Link></div></div><div className="hero-cat"><Bongo mood="hype" size="large"/><span className="sticker">BONGO<br/>BELIEVES<br/>IN YOU</span></div></section>
    <div className="home-grid"><section><div className="section-heading"><h2>Your Decks</h2><Link to="/decks" className="text-link">See all <ArrowRight size={15}/></Link></div>
    {overview.decks.length?<div className="deck-grid">{overview.decks.slice(0,6).map((deck,i)=><DeckCard key={deck.id} deck={deck} index={i}/>)}</div>:<Empty title="No decks. Yet." message="Even Bongo had to start with one flashcard." action={<Link to="/decks/new" className="button primary">Create your first deck</Link>}/>}
    <div className="quick-actions"><Link to="/decks/new" className="quick-action"><Plus/> Create New Deck</Link><Link to="/cards/new" search={{deckId:undefined}} className="quick-action"><SquarePlus/> Add Cards</Link><Link to="/import" className="quick-action"><Download/> Import Deck</Link></div>
    </section><aside className="info-column"><div className="card"><h3>Today's Overview</h3><div className="mini-metrics"><Tile icon={Layers3} value={overview.due} label="Due today" tone="cream"/><Tile icon={Flame} value={streak} label="Day streak" tone="mint"/><Tile icon={BookOpen} value={overview.cards} label="Total cards" tone="blue"/><Tile icon={Brain} value={overview.reviews.length} label="Recent reviews" tone="peach"/></div></div><div className="card"><h3>Recent Activity</h3>{overview.reviews.length?overview.reviews.slice(0,5).map((r,i)=><p className="activity" key={i}><Check size={18}/><span>Reviewed <strong>{r.deck}</strong><small>{new Date(r.created_at).toLocaleString()} · {['','Again','Hard','Good','Easy'][r.rating]}</small></span></p>):<p className="muted">Your first review will appear here.</p>}</div><div className="mascot-note"><Bongo mood="sleepy"/><p>Good cards. Better humans. Same cat.</p></div></aside></div>
  </>;
}
function DeckCard({deck,index}:{deck:Deck;index:number}){const icons=['🧠','⌨️','☁️','🎮','📚','✨'];return <Link to="/decks/$deckId" params={{deckId:deck.id}} className={'deck-card deck-tone-'+index%4}><div className="deck-art"><span aria-hidden="true">{icons[index%icons.length]}</span><span className="deck-sparkle">✦</span></div><div className="deck-info"><h3>{deck.name}</h3><p>{deck.description||'Small cards. Big brain energy.'}</p><div className="pills"><span>{deck.cards??0} cards</span><span>{deck.due??0} due</span></div><div className="deck-bottom">Brain gains await <ArrowRight size={16}/></div></div></Link>;}
function DecksPage(){const {data,loading,error}=useResource<{decks:Deck[]}>('/decks');const [term,setTerm]=useState('');if(loading)return <Loading/>;return <><Heading title="Your Decks" subtitle="Knowledge, neatly organized. Bongo approves."/><div className="section-heading"><h2>Deck Library</h2><div className="actions"><Link className="button secondary" to="/import"><Download size={18}/> Import</Link><Link className="button primary" to="/decks/new"><Plus size={18}/> New Deck</Link></div></div><Notice text={error}/><input className="filter" aria-label="Filter decks" placeholder="Filter by deck name..." value={term} onChange={e=>setTerm(e.target.value)}/><div className="deck-grid">{data?.decks.filter(d=>d.name.toLowerCase().includes(term.toLowerCase())).map((d,i)=><DeckCard key={d.id} deck={d} index={i}/>)}</div>{!data?.decks.length&&<Empty title="Nothing here yet" message="Create a deck for your first batch of brain gains."/>}</>;}
function NewDeckPage(){const [form,setForm]=useImmer({name:'',description:''});const [error,setError]=useState('');const [busy,setBusy]=useState(false);const navigate=useNavigate();async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{const r=await api<{deck:{id:string}}>('/decks',{method:'POST',body:form});void navigate({to:'/decks/$deckId',params:{deckId:r.deck.id}});}catch(e){setError(String(e));}finally{setBusy(false);}}return <><Heading title="Create a New Deck" subtitle="A place for your questionable amount of knowledge."/><form className="card form-card" onSubmit={e=>void submit(e)}><label>Deck name<input required maxLength={120} value={form.name} onChange={e=>setForm(d=>{d.name=e.target.value;})} placeholder="e.g. Philosophy, TypeScript, Cats"/></label><label>Description (optional)<textarea maxLength={500} value={form.description} onChange={e=>setForm(d=>{d.description=e.target.value;})} placeholder="What are we learning?"/></label><Notice text={error}/><button className="primary" disabled={busy}>{busy?'Creating...':'Create Deck'}</button></form></>;}
function DeckDetailPage(){const {deckId}=routeDeckDetail.useParams();const {data,loading,error}=useResource<{deck:Deck;notes:Note[]}>('/decks/'+encodeURIComponent(deckId));const navigate=useNavigate();if(loading)return <Loading/>;if(error)return <Notice text={error}/>;const deck=data!.deck;return <><Heading title={deck.name} subtitle={deck.description||'Every card counts.'}/><div className="actions"><Link className="button primary" to="/cards/new" search={{deckId}}><Plus/> Add Cards</Link><button className="secondary" onClick={()=>void startStudy(navigate,deckId)}><Play/> Study Deck</button><a className="button secondary" href={"/api/v1/decks/"+encodeURIComponent(deckId)+"/export"}><Download/> Export .deck</a><a className="button secondary" href={"/api/v1/decks/"+encodeURIComponent(deckId)+"/portable"}><Download/> Backup with Images</a></div><div className="section-heading"><h2>Notes ({data!.notes.length})</h2></div>{data!.notes.length?<div className="notes-list">{data!.notes.map(n=><div className="note-row card" key={n.id}><div><small className="pill">{n.type}</small><h3>{n.front}</h3><p>{n.back||'Cloze card'}</p><small>{n.tags}</small><div className="actions"><Link className="button secondary" to="/notes/$noteId/edit" params={{noteId:n.id}}>Edit Note</Link></div></div></div>)}</div>:<Empty title="No cards yet" message="Feed the knowledge goblin with your first note." action={<Link className="button primary" to="/cards/new" search={{deckId}}>Add Cards</Link>}/>}</>;}

const NOTE_KINDS=['basic','reverse','optional-reverse','cloze','type-answer','multiple-choice','multiple-select','ordering','image-occlusion'] as const;
const FIELD_NAMES:Record<string,string[]>={basic:['Front','Back'],reverse:['Front','Back'],'optional-reverse':['Front','Back','Add reverse card'],
  cloze:['Cloze text','Extra'],'type-answer':['Question','Typed answer'],'multiple-choice':['Prompt','Choices','Correct choice','Explanation'],
  'multiple-select':['Prompt','Choices','Correct choices','Explanation'],ordering:['Prompt','Items in correct order','Explanation'],'image-occlusion':['Image','Masks','Extra']};
type ChoiceShape={id:string;text:string};
function decodeChoices(input:string):ChoiceShape[]{
  try {const data=JSON.parse(input) as unknown;return Array.isArray(data)?data.filter((x):x is ChoiceShape=>!!x&&typeof x.id==='string'&&typeof x.text==='string'):[];}catch{return [];}
}
function fieldsForEditor(type:string,front:string,back:string):string[]{
  const choices=JSON.stringify([{id:'1',text:''},{id:'2',text:''}]);
  return type==='image-occlusion'?['','[]','']:type==='optional-reverse'?[front,back,'']:type==='multiple-choice'?[front,choices,'1','']:
    type==='multiple-select'?[front,choices,'["1"]','']:type==='ordering'?[front,choices,'']:[front,back];
}

function ImageOcclusionFields({fields,onChange}:{fields:string[];onChange:(fields:string[])=>void}){
  const [uploadError,setUploadError]=useState(''),[uploading,setUploading]=useState(false);
  const set=(i:number,value:string)=>{const next=[...fields];next[i]=value;onChange(next);};
  const hash=/^deez-media:\/\/sha256:([a-f0-9]{64})$/.exec(fields[0]||'')?.[1];
  let masks:{id:number;x:number;y:number;width:number;height:number;answer:string;prompt?:string}[]=[];
  try{const parsed=JSON.parse(fields[1]||'[]') as unknown;if(Array.isArray(parsed))masks=parsed;}catch{/* Invalid old data is surfaced on save. */}
  const saveMasks=(next:typeof masks)=>set(1,JSON.stringify(next));
  async function upload(file:File|undefined){
    if(!file)return;
    if(file.size>2*1024*1024){setUploadError('Image must be 2 MiB or smaller.');return;}
    setUploading(true);setUploadError('');
    try{
      const data=new Uint8Array(await file.arrayBuffer());let raw='';
      for(let i=0;i<data.length;i+=8192)raw+=String.fromCharCode(...data.subarray(i,i+8192));
      const response=await api<{ref:string}>('/media',{method:'POST',body:{data:btoa(raw)}});
      set(0,response.ref);
    }catch(e){setUploadError(String(e));}finally{setUploading(false);}
  }
  return <fieldset className="choices-editor"><legend>Image occlusion</legend>
    <label>Image (PNG/JPEG/WebP, 2 MiB max)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void upload(e.target.files?.[0])}/></label>
    {uploading&&<p role="status">Uploading image...</p>}
    {uploadError&&<Notice text={uploadError}/>}
    {hash&&<img src={'/api/v1/media/'+hash} alt="Image to memorize" style={{maxWidth:'100%',maxHeight:300}}/>}
    <p className="muted">Masks use normalized 0–1 coordinates. Graphic drag editing is not available yet.</p>
    {masks.map((mask,index)=><div key={mask.id} className="card" style={{marginBottom:12}}>
      <strong>Mask {mask.id}</strong>
      <div className="field-grid">{(['x','y','width','height'] as const).map(k=><label key={k}>{k}<input type="number" min="0" max="1" step=".01" value={mask[k]} onChange={e=>saveMasks(masks.map((m,j)=>j===index?{...m,[k]:Number(e.target.value)}:m))}/></label>)}</div>
      <label>Answer<input required value={mask.answer} onChange={e=>saveMasks(masks.map((m,j)=>j===index?{...m,answer:e.target.value}:m))}/></label>
      <label>Prompt (optional)<input value={mask.prompt||''} onChange={e=>saveMasks(masks.map((m,j)=>j===index?{...m,prompt:e.target.value}:m))}/></label>
      <button type="button" className="secondary" onClick={()=>saveMasks(masks.filter((_,j)=>j!==index))}>Remove Mask</button>
    </div>)}
    <button type="button" className="secondary" disabled={masks.length>=100} onClick={()=>saveMasks([...masks,{id:Math.max(0,...masks.map(m=>m.id))+1,x:0.1,y:0.1,width:0.2,height:0.2,answer:''}])}>Add Mask</button>
    <label>Extra notes<textarea value={fields[2]||''} maxLength={6000} onChange={e=>set(2,e.target.value)}/></label>
  </fieldset>;
}

function CardFields({type,fields,onChange}:{type:string;fields:string[];onChange:(values:string[])=>void}){
  const labels=FIELD_NAMES[type]||FIELD_NAMES.basic!;
  if(type==='image-occlusion')return <ImageOcclusionFields fields={fields} onChange={onChange}/>;
  const set=(index:number,value:string)=>{const copy=[...fields];copy[index]=value;onChange(copy);};
  const hasChoices=['multiple-choice','multiple-select','ordering'].includes(type);
  const choices=hasChoices?decodeChoices(fields[1]||''):[];
  const mutateChoices=(next:ChoiceShape[])=>set(1,JSON.stringify(next));
  const selected=type==='multiple-select'?(()=>{try{return JSON.parse(fields[2]||'[]') as string[];}catch{return [];}})():[fields[2]||''];
  return <div className="card-fields">
    {labels.map((label,i)=>{
      if(type==='optional-reverse'&&i===2)return <label key={label} className="checkbox-line"><input type="checkbox" checked={!!fields[2]} onChange={e=>set(2,e.target.checked?'yes':'')}/> Create a reverse card too</label>;
      if(hasChoices&&i===1)return <fieldset key={label} className="choices-editor"><legend>{type==='ordering'?'Items (top to bottom is the correct order)':'Choices'}</legend>
        {choices.map((choice,index)=><div className="choice-row" key={choice.id}>
          {type!=='ordering'&&<input aria-label={'Mark '+(index+1)+' correct'} type={type==='multiple-select'?'checkbox':'radio'} name="correct-answer" checked={selected.includes(choice.id)} onChange={e=>set(2,type==='multiple-select'?JSON.stringify(e.target.checked?[...selected,choice.id]:selected.filter(id=>id!==choice.id)):choice.id)}/>}
          <input aria-label={'Choice '+(index+1)} value={choice.text} maxLength={1000} onChange={e=>mutateChoices(choices.map((x,n)=>n===index?{...x,text:e.target.value}:x))}/>
          {type==='ordering'&&<button type="button" className="secondary" disabled={index===0} onClick={()=>{const next=[...choices];[next[index-1],next[index]]=[next[index]!,next[index-1]!];mutateChoices(next);}} aria-label={'Move item '+(index+1)+' up'}>↑</button>}
          <button type="button" className="secondary" disabled={choices.length<=2} onClick={()=>{const next=choices.filter(x=>x.id!==choice.id);mutateChoices(next);if(selected.includes(choice.id))set(2,type==='multiple-select'?'[]':next[0]!.id);}} aria-label={'Remove choice '+(index+1)}>×</button>
        </div>)}
        <button className="secondary" type="button" disabled={choices.length>=100} onClick={()=>mutateChoices([...choices,{id:crypto.randomUUID(),text:''}])}>Add choice</button>
      </fieldset>;
      if(hasChoices&&i===2&&type!=='ordering')return null;
      return <label key={label}>{label}<textarea required={i===0||i===1&&!hasChoices&&type!=='cloze'} maxLength={6000} rows={i===0?4:3} value={fields[i]||''} placeholder={type==='cloze'&&i===0?'The {{c1::capital}} of France is Paris.':undefined} onChange={e=>set(i,e.target.value)}/></label>;
    })}
  </div>;
}

function CardEditorPage(){const {deckId}=routeCardNew.useSearch();const {data,loading}=useResource<{decks:Deck[]}>('/decks');const [form,setForm]=useImmer({deckId:deckId||'',type:'basic',front:'',back:'',fields:['',''],tags:''});const [error,setError]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  const draft=useResource<{draft:{deckId:string;type:string;front:string;back:string;tags:string;fields?:string[];revision:number}|null}>('/drafts/new');
  const [draftReady,setDraftReady]=useState(false),[draftRevision,setDraftRevision]=useState(0);
  const [draftStatus,setDraftStatus]=useState('Loading draft...'),[draftConflict,setDraftConflict]=useState(false);
  const lastSaved=useRef(''),saving=useRef(false);
  type DraftFields={deckId:string;type:string;front:string;back:string;fields:string[];tags:string;revision:number};
  const [draftCompare,setDraftCompare]=useState<{local:DraftFields;server:DraftFields|null;chosen:(keyof EditableNote)[]}|null>(null);
  async function refreshDraftConflict(){
    const response=await api<{draft:DraftFields|null}>('/drafts/new');
    const local={...formRef.current,revision:draftRevision};
    const base=lastSaved.current?JSON.parse(lastSaved.current) as DraftFields:local;
    const merged=mergeEdits(toEditable(base),toEditable(local),toEditable(response.draft||{...local,fields:['',''],front:'',back:'',tags:''}));
    setDraftCompare({local,server:response.draft,chosen:merged.changes});
    setDraftConflict(true);
    setDraftStatus('Conflict: your draft is not saved. Compare both versions before choosing.');
  }
  const formRef=useRef(form);formRef.current=form;
  async function resolveDraftConflict(useLocal:boolean){
    if(!draftCompare)return;
    setBusy(true);
    try{
      if(!useLocal){
        const remote=draftCompare.server;
        if(remote){
          const state={deckId:remote.deckId,type:remote.type,front:remote.front,back:remote.back,fields:remote.fields||[remote.front,remote.back],tags:remote.tags};
          setForm(state);lastSaved.current=JSON.stringify(state);setDraftRevision(remote.revision);
        }else{
          const cleared={deckId:'',type:'basic',front:'',back:'',fields:['',''],tags:''};
          setForm(cleared);lastSaved.current=JSON.stringify(cleared);setDraftRevision(0);
        }
      }else{
        const local=draftCompare.local;
        const remote=draftCompare.server||{...local,front:'',back:'',fields:['',''],tags:'',revision:0};
        const merged=applySelections(toEditable(remote),toEditable(local),draftCompare.chosen);
        const selected={...merged,deckId:local.deckId};
        const response=await api<{revision:number}>('/drafts/new',{method:'PUT',body:{...selected,revision:remote.revision}});
        setForm(selected);lastSaved.current=JSON.stringify(selected);setDraftRevision(response.revision);
      }
      setDraftCompare(null);setDraftConflict(false);setDraftStatus('Draft conflict resolved.');
    }catch(e){setDraftStatus(String(e));if(e instanceof ApiRequestError&&e.status===409)await refreshDraftConflict();}
    finally{setBusy(false);}
  }

  useEffect(()=>{
    if(draftReady||draft.loading)return;
    const value=draft.data?.draft;
    if(value){const restored={deckId:deckId||value.deckId,type:value.type,front:value.front,back:value.back,fields:value.fields||fieldsForEditor(value.type,value.front,value.back),tags:value.tags};
      setForm(restored);lastSaved.current=JSON.stringify(restored);setDraftRevision(value.revision);setDraftStatus('Draft restored');}
    else {lastSaved.current=JSON.stringify(form);setDraftRevision(0);setDraftStatus('Draft ready');}
    setDraftReady(true);setDraftConflict(false);
  },[draftReady,draft.loading,draft.data,deckId,setForm]);
  useEffect(()=>{
    if(!draftReady||draftConflict||busy)return;
    const serialized=JSON.stringify(form);
    if(serialized===lastSaved.current)return;
    const timeout=window.setTimeout(()=>{
      if(saving.current)return;
      saving.current=true;setDraftStatus('Saving draft...');
      void api<{revision:number}>('/drafts/new',{method:'PUT',body:{...form,revision:draftRevision}})
        .then(result=>{lastSaved.current=serialized;setDraftRevision(result.revision);setDraftStatus('Draft saved across devices');})
        .catch(error=>{if(error instanceof ApiRequestError&&error.status===409)void refreshDraftConflict();else{setDraftConflict(true);setDraftStatus('Unsaved: '+String(error));}})
        .finally(()=>{saving.current=false;});
    },650);
    return()=>window.clearTimeout(timeout);
  },[form,draftRevision,draftReady,draftConflict,busy]);

  useEffect(()=>{if(deckId)setForm(s=>{s.deckId=deckId;});},[deckId,setForm]);
  async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');setMessage('');try{const result=await api<{generatedCards:number}>('/notes',{method:'POST',body:form});setMessage('Saved! '+result.generatedCards+' card(s) ready to study.');setForm(s=>{s.front='';s.back='';s.fields=fieldsForEditor(s.type,'','');s.tags='';});const cleared={...form,front:'',back:'',fields:fieldsForEditor(form.type,'',''),tags:''};lastSaved.current=JSON.stringify(cleared);if(draftRevision>0){void api('/drafts/new',{method:'DELETE',body:{revision:draftRevision}}).then(()=>{setDraftRevision(0);setDraftStatus('Card saved. Draft cleared.');}).catch(()=>{setDraftConflict(true);setDraftStatus('Card saved, but the draft changed elsewhere. Reload before editing again.');});}}catch(e){setError(String(e));}finally{setBusy(false);}}
  return <><Heading title="Add a New Card" subtitle="Feed the knowledge goblin. Weaponize your neurons." mood="hype"/><div className="editor-grid"><form className="card editor" onSubmit={e=>void save(e)}><h3><span className="step">1</span> Choose a Deck</h3>{loading?<p>Loading decks...</p>:<><label htmlFor="target-deck">Deck</label><select id="target-deck" required value={form.deckId} onChange={e=>setForm(s=>{s.deckId=e.target.value;})}><option value="">Select a deck</option>{data?.decks.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></>}<Link to="/decks/new" className="text-link">Create a new deck <Plus size={14}/></Link><h3><span className="step step-blue">2</span> Card Type</h3><div className="type-grid">{NOTE_KINDS.map(t=><button type="button" className={'type-button '+(form.type===t?'selected':'')} key={t} aria-pressed={form.type===t} onClick={()=>setForm(s=>{s.type=t;s.fields=fieldsForEditor(t,s.front,s.back);})}><Layers3 size={19}/><strong>{t.replaceAll('-',' ')}</strong><small>{t==='cloze'?'Fill in the blank':t==='reverse'?'Both ways':t==='basic'?'Front → Back':'Choose format'}</small></button>)}</div><h3><span className="step step-amber">3</span> Card Content</h3><CardFields type={form.type} fields={form.fields} onChange={values=>setForm(d=>{d.fields=values;d.front=values[0]||'';d.back=values[1]||'';})}/><label>Tags (optional)<input value={form.tags} maxLength={300} onChange={e=>setForm(s=>{s.tags=e.target.value;})} placeholder="philosophy, basics, things Bongo knows"/></label><p className="muted" role="status">{draftStatus}</p>{draftConflict&&draftCompare&&<section className="card conflict" role="alert" aria-label="Concurrent draft edit">
  <h3>Draft conflict</h3><p>Your edits are still available locally. Another device saved a different draft.</p>
  <DifferenceTable local={draftCompare.local} server={draftCompare.server||{...draftCompare.local,front:'',back:'',fields:['',''],tags:''}}/>
  {(['type','fields','tags'] as const).map(key=><label key={key} className="checkbox-line"><input type="checkbox" checked={draftCompare.chosen.includes(key)} onChange={e=>setDraftCompare(c=>c?{...c,chosen:e.target.checked?[...c.chosen,key]:c.chosen.filter(x=>x!==key)}:null)}/> Keep my {key}</label>)}
  <div className="actions"><button type="button" className="secondary" disabled={busy} onClick={()=>void resolveDraftConflict(false)}>Use server draft</button>
  <button type="button" className="primary" disabled={busy} onClick={()=>void resolveDraftConflict(true)}>Reapply selected fields</button></div>
</section>}
{draftConflict&&!draftCompare&&<button type="button" className="secondary" onClick={()=>void refreshDraftConflict()}>Check latest draft</button>}<Notice text={error}/>{message&&<div className="success" role="status">{message}</div>}<button disabled={busy} className="primary"><Sparkles size={18}/> {busy?'Saving...':'Save Card'}</button></form><aside className="editor-side"><div className="card preview"><h3><Eye size={20}/> Live Preview</h3><div className="preview-front">{form.type==='image-occlusion'&&form.fields[0]?.startsWith('deez-media://sha256:')?<img src={'/api/v1/media/'+form.fields[0].slice(-64)} alt="Uploaded flashcard visual" style={{maxWidth:'100%'}}/>:form.front||'Your card front will appear here...'}</div><div className="preview-back">{form.back||'Your answer will appear here...'}</div><Bongo mood="happy"/></div><div className="card"><h3><CircleHelp size={20}/> Card Writing Tips</h3><p>One idea per card. Short, specific questions stick.</p><p>Use your own words. Future you says thanks.</p><p>Cloze example: <code>{'{{c1::answer}}'}</code>.</p></div></aside></div></>;
}


function DifferenceTable({local,server}:{local:EditableNote;server:EditableNote}){
  return <table className="difference-table"><thead><tr><th>Field</th><th>Your unsaved changes</th><th>Latest server content</th></tr></thead><tbody>
    {(['type','fields','tags'] as const).map(key=><tr key={key}><th scope="row">{key}</th>
      <td><pre>{JSON.stringify(local[key],null,2)}</pre></td>
      <td><pre>{JSON.stringify(server[key],null,2)}</pre></td></tr>)}
  </tbody></table>;
}
function toEditable(input:{type:string;front:string;back:string;fields:string[];tags:string}):EditableNote{
  return {type:input.type,front:input.front,back:input.back,fields:[...input.fields],tags:input.tags};
}

function EditNotePage(){
  const {noteId}=routeNoteEdit.useParams();
  type RemoteNote=EditableNote&{id:string;deckId:string;revision:number};
  const {data,loading,error,reload}=useResource<{note:RemoteNote}>('/notes/'+encodeURIComponent(noteId));
  const [form,setForm]=useImmer({type:'basic',front:'',back:'',fields:['',''],tags:'',revision:0});
  const [initialized,setInitialized]=useState(false);
  const [message,setMessage]=useState(''),[failure,setFailure]=useState(''),[busy,setBusy]=useState(false);
  const base=useRef<EditableNote|null>(null),loadedRevision=useRef<number|null>(null);
  const lastDeckId=useRef('');
  const formRef=useRef(form);formRef.current=form;
  const [conflict,setConflict]=useState<{server:RemoteNote;local:EditableNote;chosen:(keyof EditableNote)[]}|null>(null);
  useEffect(()=>{
    if(!data?.note)return;
    lastDeckId.current=data.note.deckId;
    if(loadedRevision.current===null){
      setForm({...toEditable(data.note),revision:data.note.revision});
      base.current=toEditable(data.note);loadedRevision.current=data.note.revision;setInitialized(true);
    }else if(data.note.revision!==loadedRevision.current){
      const your=toEditable(formRef.current);
      const changed=mergeEdits(base.current||your,your,data.note);
      setConflict({server:data.note,local:your,chosen:changed.changes});
      setFailure('This note changed on another device. Your work is preserved below.');
    }
  },[data,setForm]);
  async function refreshConflict(local:EditableNote){
    const response=await api<{note:RemoteNote}>('/notes/'+encodeURIComponent(noteId));
    const changed=mergeEdits(base.current||local,local,response.note);
    setConflict({server:response.note,local,chosen:changed.changes});
  }
  async function save(e:React.FormEvent){
    e.preventDefault();if(conflict)return;setBusy(true);setFailure('');setMessage('');
    try{
      const result=await api<{note:{revision:number}}>('/notes/'+encodeURIComponent(noteId),{method:'PUT',body:form});
      const saved=toEditable(form);setForm(d=>{d.revision=result.note.revision;});
      base.current=saved;loadedRevision.current=result.note.revision;
      setMessage('Saved. Existing generated cards kept their review history.');
    }catch(e){
      if(e instanceof ApiRequestError&&e.status===409){
        try{await refreshConflict(toEditable(form));}catch(err){setFailure(String(err));}
      }else setFailure(String(e));
    }finally{setBusy(false);}
  }
  async function applyConflict(useLocal:boolean){
    if(!conflict)return;setBusy(true);setFailure('');
    const server=conflict.server;
    try{
      if(!useLocal){
        setForm({...toEditable(server),revision:server.revision});base.current=toEditable(server);
        loadedRevision.current=server.revision;setConflict(null);setMessage('Server version restored. Local changes were discarded by your choice.');
      }else{
        const merged=applySelections(server,conflict.local,conflict.chosen);
        const saved=await api<{note:{revision:number}}>('/notes/'+encodeURIComponent(noteId),{method:'PUT',body:{...merged,revision:server.revision}});
        setForm({...merged,revision:saved.note.revision});base.current=merged;
        loadedRevision.current=saved.note.revision;setConflict(null);setMessage('Your selected changes were reapplied to the latest version.');
      }
    }catch(e){
      if(e instanceof ApiRequestError&&e.status===409)await refreshConflict(conflict.local);
      else setFailure(String(e));
    }finally{setBusy(false);}
  }
  if(error&&!initialized)return <Notice text={error}/>;
  if(!initialized)return <Loading/>;
  return <><Heading title="Edit Note" subtitle="Fine-tune your knowledge without losing your brain gains."/>
    <form className="card form-card" onSubmit={e=>void save(e)}>
      <label>Note type<select value={form.type} onChange={e=>setForm(d=>{d.type=e.target.value;d.fields=fieldsForEditor(e.target.value,d.front,d.back);})}>{NOTE_KINDS.map(kind=><option key={kind} value={kind}>{kind.replaceAll('-',' ')}</option>)}</select></label>
      <CardFields type={form.type} fields={form.fields} onChange={values=>setForm(d=>{d.fields=values;d.front=values[0]||'';d.back=values[1]||'';})}/>
      <label>Tags<input maxLength={300} value={form.tags} onChange={e=>setForm(d=>{d.tags=e.target.value;})}/></label>
      <p className="muted">Revision {form.revision}. Overlapping changes require an explicit choice.</p>
      {conflict&&<section className="card conflict" role="alert" aria-label="Concurrent note edit">
        <h3>Two devices edited this note</h3><p>Your unsaved text has not been discarded. Select the fields to reapply on top of the latest server version.</p>
        <DifferenceTable local={conflict.local} server={conflict.server}/>
        {(['type','fields','tags'] as const).map(k=><label className="checkbox-line" key={k}><input type="checkbox" checked={conflict.chosen.includes(k)} onChange={e=>setConflict(c=>c?{...c,chosen:e.target.checked?[...c.chosen,k]:c.chosen.filter(x=>x!==k)}:null)}/> Reapply my {k}</label>)}
        <div className="actions"><button type="button" className="secondary" disabled={busy} onClick={()=>void applyConflict(false)}>Use latest server version</button>
          <button type="button" className="primary" disabled={busy} onClick={()=>void applyConflict(true)}>Reapply selected changes</button></div>
      </section>}
      <Notice text={failure}/>{message&&<div className="success" role="status">{message}</div>}
      <div className="actions"><button className="primary" disabled={busy||!!conflict}>{busy?'Saving...':'Save Changes'}</button><button type="button" className="secondary" onClick={()=>{reload();setFailure('');}}>Check for Updates</button><Link className="button secondary" to="/decks/$deckId" params={{deckId:lastDeckId.current}}>Back to Deck</Link></div>
    </form></>;
}
function PortableImportPage(){
  const navigate=useNavigate();
  const [archive,setArchive]=useState<unknown>(null);
  const [preview,setPreview]=useState<{name:string;notes:number;cards:number;assets:number;checksum:string}|null>(null);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function select(file:File|undefined){
    if(!file)return;
    setArchive(null);setPreview(null);setError('');
    if(file.size>12*1024*1024){setError('Archive must be 12 MiB or smaller.');return;}
    setBusy(true);
    try{
      const value=JSON.parse(await file.text()) as unknown;
      const result=await api<{name:string;notes:number;cards:number;assets:number;checksum:string}>('/portable/preview',{method:'POST',body:{bundle:value}});
      setArchive(value);setPreview(result);
    }catch(e){setError(String(e));}finally{setBusy(false);}
  }
  async function commit(){
    if(!archive||!preview)return;setBusy(true);setError('');
    try{
      const saved=await api<{deckId:string}>('/portable/import',{method:'POST',body:{bundle:archive,confirmation:'IMPORT_PORTABLE'}});
      void navigate({to:'/decks/$deckId',params:{deckId:saved.deckId}});
    }catch(e){setError(String(e));}finally{setBusy(false);}
  }
  return <><Heading title="Restore Portable Deck" subtitle="Bring the cards and their attached images. No hosted storage needed."/>
    <div className="card form-card">
      <label>Choose your Vutadex portable JSON backup
        <input type="file" accept=".json,application/json" onChange={e=>void select(e.target.files?.[0])}/>
      </label>
      <p className="muted">Version 1 restores card content, masks and verified image bytes locally. Existing schedules and review history do not transfer. Your original files are not modified.</p>
      {preview&&<section role="status" className="success"><strong>{preview.name}</strong> — {preview.notes} notes, {preview.cards} cards, {preview.assets} verified images.
        <p className="muted">SHA-256: {preview.checksum}</p>
        <button type="button" className="primary" disabled={busy} onClick={()=>void commit()}>Confirm Portable Restore</button>
      </section>}
      <Notice text={error}/>
    </div></>;
}

function ImportPage(){
  const navigate=useNavigate();
  const [form,setForm]=useImmer({format:'deck',name:'',content:''});
  const [preview,setPreview]=useState<{name:string;notes:number;cards:number}|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function load(file:File|undefined){if(!file)return;if(file.size>4*1024*1024){setError('File exceeds 4 MiB');return;}
    const content=await file.text();setPreview(null);setError('');setForm(d=>{d.format=file.name.toLowerCase().endsWith('.csv')?'csv':'deck';d.name=file.name.replace(/\.(deck|csv)$/i,'');d.content=content;});}
  async function requestPreview(){setBusy(true);setError('');try{setPreview(await api('/import/preview',{method:'POST',body:form}));}catch(e){setError(String(e));}finally{setBusy(false);}}
  async function importConfirmed(){setBusy(true);setError('');try{const r=await api<{deckId:string}>('/import',{method:'POST',body:form});void navigate({to:'/decks/$deckId',params:{deckId:r.deckId}});}catch(e){setError(String(e));}finally{setBusy(false);}}
  return <><Heading title="Import a Deck" subtitle="Bring the knowledge. Leave the old review history behind."/>
    <div className="card form-card"><label>Choose a .deck v2 or CSV file<input type="file" accept=".deck,.csv,text/plain,text/csv" onChange={e=>void load(e.target.files?.[0])}/></label>
    {form.format==='csv'&&<label>New deck name<input required value={form.name} maxLength={120} onChange={e=>setForm(d=>{d.name=e.target.value;setPreview(null);})}/></label>}
    <p className="muted">Content-only import. All cards begin with fresh schedules. Unrecognized note types are rejected before saving.</p>
    <button className="primary" onClick={()=>void requestPreview()} disabled={!form.content||busy}>Preview Import</button>
    {preview&&<div className="success"><strong>{preview.name}</strong> — {preview.notes} notes, {preview.cards} generated cards. No review history will transfer.<div className="actions"><button className="primary" onClick={()=>void importConfirmed()} disabled={busy}>Confirm Import</button></div></div>}
    <Notice text={error}/><p><Link to="/portable/import">Restore a deck with attached images</Link></p></div></>;
}
function StudyStartPage(){const {data,loading}=useResource<Overview>('/overview');const navigate=useNavigate();const [busy,setBusy]=useState(false);const [error,setError]=useState('');async function start(id?:string){setBusy(true);setError('');try{await startStudy(navigate,id);}catch(e){setError(String(e));}finally{setBusy(false);}}return <><Heading title="Study Time!" subtitle="Same cards. A smarter you. Bongo believes in you." mood="hype"/><div className="section-heading"><h2>Choose your battlefield</h2></div><Notice text={error}/><button className="primary" disabled={busy} onClick={()=>void start()}><Play/> Study All Due Cards</button>{loading?<Loading/>:<div className="deck-grid study-decks">{data?.decks.map((d,i)=><button key={d.id} className={'deck-card deck-tone-'+i%4} disabled={busy} onClick={()=>void start(d.id)}><div className="deck-info"><h3>{d.name}</h3><p>{d.due||0} cards due now</p><div className="deck-bottom">Study this deck <ArrowRight/></div></div></button>)}</div>}</>;}
async function startStudy(navigate:ReturnType<typeof useNavigate>,deckId?:string){const r=await api<{id:string}>('/study',{method:'POST',body:deckId?{deckId}:{}});await navigate({to:'/study/$sessionId',params:{sessionId:r.id}});}
function humanInterval(ms:number):string{
  if(ms<3600000)return Math.max(1,Math.round(ms/60000))+'m';
  if(ms<86400000)return Math.max(1,Math.round(ms/3600000))+'h';
  return Math.max(1,Math.round(ms/86400000))+'d';
}

function OcclusionQuestion({view,revealed}:{view:Extract<StudyPresentation,{kind:'image-occlusion'}>;revealed:boolean}){
  const rect=(mask:MaskRect):React.CSSProperties=>({
    left:(mask.x*100)+'%',top:(mask.y*100)+'%',width:(mask.width*100)+'%',height:(mask.height*100)+'%'
  });
  return <div>
    <h2>{view.prompt}</h2>
    <div className="occlusion-image" role="group" aria-label="Image with hidden study region">
      <img src={'/api/v1/media/'+view.imageHash} alt="Study image with occluded regions"/>
      {view.otherMasks.map(mask=><span key={mask.id} className="occlusion-cover other" style={rect(mask)} aria-hidden="true"/>)}
      <span className={'occlusion-cover target'+(revealed?' revealed':'')} style={rect(view.mask)}
        role="img" aria-label={revealed?'Revealed target region':'Masked region to identify'}/>
    </div>
    <p className="muted">{revealed?'Target region outlined. Compare the answer below.':'Identify the covered region, then reveal the answer.'}</p>
  </div>;
}

function StudySessionPage(){const {sessionId}=routeStudySession.useParams();const {data,loading,error,reload}=useResource<Study>('/study/'+encodeURIComponent(sessionId));const [revealed,setRevealed]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [canUndo,setCanUndo]=useState(false);const [typed,setTyped]=useState('');const rate=async(rating:number)=>{if(!data?.card||!revealed||busy)return;setBusy(true);setMessage('');try{await api('/study/'+encodeURIComponent(sessionId)+'/rate',{method:'POST',body:{rating,revision:data.revision,operationId:crypto.randomUUID()}});setRevealed(false);setTyped('');setCanUndo(true);reload();}catch(e){setMessage(String(e));reload();}finally{setBusy(false);}};
  useEffect(()=>{const handle=(e:KeyboardEvent)=>{if(['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement)?.tagName))return;if(e.code==='Space'&&!revealed){e.preventDefault();setRevealed(true);}if(revealed&&['1','2','3','4'].includes(e.key)){e.preventDefault();void rate(Number(e.key));}};window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle);},[revealed,busy,data,sessionId]);

  const lastInteraction=useRef(Date.now());
  useEffect(()=>{
    const mark=()=>{lastInteraction.current=Date.now();};
    window.addEventListener('keydown',mark);
    window.addEventListener('pointerdown',mark);
    const timer=window.setInterval(()=>{
      if(document.visibilityState!=='visible'||!data?.card||data.paused||Date.now()-lastInteraction.current>60000)return;
      void api('/study/'+encodeURIComponent(sessionId)+'/activity',{method:'POST',
        body:{durationMs:15000,eventId:crypto.randomUUID()}}).catch(()=>{/* Metrics are best-effort; reviews are authoritative. */});
    },15000);
    return()=>{window.clearInterval(timer);window.removeEventListener('keydown',mark);window.removeEventListener('pointerdown',mark);};
  },[sessionId,Boolean(data?.card),data?.paused]);
  async function updateSession(action:'pause'|'resume'|'undo'){
    if(!data)return;setBusy(true);setMessage('');
    try{await api('/study/'+encodeURIComponent(sessionId)+'/'+action,{method:'POST',body:{revision:data.revision}});
      if(action==='undo'){setCanUndo(false);setRevealed(false);setTyped('');}reload();
    }catch(e){setMessage(String(e));reload();}finally{setBusy(false);}
  }
  if(loading)return <Loading/>;if(error)return <Notice text={error}/>;if(!data?.card)return <><Heading title="Brain gains secured!" subtitle="You cleared the queue. Bongo is proud of you." mood="hype"/><Empty title="All done for now" message="Come back when more cards are due." action={<Link className="button primary" to="/">Back to home</Link>}/></>;
  return <><Heading title="Study Session" subtitle="A slightly smarter you, one card at a time." mood="thinking"/><div className="study-controls actions">
      <button className="secondary" disabled={busy} onClick={()=>void updateSession(data.paused?'resume':'pause')}>{data.paused?'Resume Session':'Pause Session'}</button>
      {canUndo&&<button className="secondary" disabled={busy} onClick={()=>void updateSession('undo')}><RotateCcw size={17}/> Undo Last Rating</button>}
    </div><div className="study-layout"><div><div className="progress-label">Card {data.position+1} of {data.total}<span>{Math.round(data.position/Math.max(1,data.total)*100)}%</span></div><div className="progress"><div style={{width:String(data.position/Math.max(1,data.total)*100)+'%'}}/></div><div className="study-card card"><small className="pill">Question</small>{data.card.presentation.kind==='image-occlusion'
        ?<OcclusionQuestion view={data.card.presentation} revealed={revealed}/>
        :<h2>{data.card.front}</h2>}
      {data.card.presentation.kind==='type-answer'&&<label className="typed-input">Type your answer
        <input value={typed} disabled={revealed||busy} placeholder="Your answer (self-assessment)"
          onChange={e=>setTyped(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter'&&!revealed){e.preventDefault();setRevealed(true);}}}/>
      </label>}
      {revealed&&<div className="answer"><span className="eyebrow">THE REVEAL</span>
        <p>{data.card.back}</p>
        {data.card.presentation.kind==='type-answer'&&<p role="status" className="muted">{
          compareTypedAnswer(typed,data.card.back)==='match'
            ?'Your typed answer matches after whitespace and case normalization.'
            :compareTypedAnswer(typed,data.card.back)==='empty'
              ?'No typed answer entered. Rate how well you recalled it.'
              :'Your typed answer differs. Compare it above and choose your own recall rating.'
        }</p>}
      </div>}</div>{data.paused?<div className="waiting"><Clock/> Session paused. Resume to continue.</div>:data.waiting>0?<div className="waiting"><Clock/> This card returns in about {Math.ceil(data.waiting/1000)} seconds. <button className="secondary" onClick={reload}>Check again</button></div>:!revealed?<button className="primary reveal" onClick={()=>setRevealed(true)}><Eye/> Show Answer <kbd>Space</kbd></button>:<div className="rating-grid">{([{name:'Again',key:1,subtitle:'Forgot it',tone:'peach'},{name:'Hard',key:2,subtitle:'Still fuzzy',tone:'cream'},{name:'Good',key:3,subtitle:'Mostly got it',tone:'mint'},{name:'Easy',key:4,subtitle:'Knew it well',tone:'blue'}] as const).map(r=><button disabled={busy} key={r.key} className={'rating rating-'+r.tone} onClick={()=>void rate(r.key)}><Bongo mood={r.key===1?'sleepy':r.key===2?'thinking':r.key===4?'hype':'happy'}/><strong>{r.name}</strong><kbd>{r.key}</kbd><small>{r.subtitle} · {data.intervals.find(x=>x.rating===r.key)?humanInterval(data.intervals.find(x=>x.rating===r.key)!.intervalMs):'—'}</small></button>)}</div>}<Notice text={message}/></div><aside className="study-aside"><div className="card"><h3>Session Progress</h3><Tile icon={Layers3} value={data.total-data.position} label="Remaining" tone="mint"/><Tile icon={Check} value={data.position} label="Reviewed" tone="cream"/></div><div className="mascot-note"><Bongo mood="happy"/><p>FOCUS MODE: BONGO BELIEVES IN YOU.</p></div></aside></div></>;
}

function accountDate(instant:number,timezone:string):string{
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(instant));
  const get=(name:string)=>parts.find(p=>p.type===name)!.value;
  return get('year')+'-'+get('month')+'-'+get('day');
}
function computeStreak(reviews:Review[],timezone='UTC'):number{
  const days=new Set(reviews.map(r=>r.day||accountDate(r.created_at,timezone)));
  let date=Date.parse(accountDate(Date.now(),timezone)+'T00:00:00Z'),streak=0;
  if(!days.has(new Date(date).toISOString().slice(0,10)))date-=86400000;
  while(days.has(new Date(date).toISOString().slice(0,10))){streak++;date-=86400000;}
  return streak;
}
function StatsPage(){
  const {data,loading,error}=useResource<{timezone:string;reviews:Review[];forecast:{day:string;due:number}[];matureRetention:{eligible:number;recalled:number;observedPercent:number|null;byDeck:{deck:string;eligible:number;observedPercent:number}[]};activeStudyMs:number}>('/stats');
  if(loading)return <Loading/>;if(error)return <Notice text={error}/>;
  const reviews=data?.reviews||[],zone=data?.timezone||'UTC',forecast=data?.forecast||[];
  const counts=new Map<string,number>();
  for(const r of reviews){const key=r.day||accountDate(r.created_at,zone);counts.set(key,(counts.get(key)||0)+1);}
  const dayStart=Date.parse(accountDate(Date.now(),zone)+'T00:00:00Z');
  const days=Array.from({length:84},(_,i)=>{const label=new Date(dayStart-(83-i)*86400000).toISOString().slice(0,10);return {label,count:counts.get(label)||0};});
  const recalled=reviews.filter(r=>r.rating!==1).length;
  return <><Heading title="Your Brain's Progress" subtitle="Real reviews. Account-timezone charts. Absolutely no imaginary brain gains." mood="hype"/>
    <p className="muted">Displayed in {zone}. Self-ratings are not a measured retention probability.</p>
    <div className="metrics-row">
      <Tile icon={BookOpen} value={reviews.length} label="Recent reviews" tone="mint"/>
      <Tile icon={Flame} value={computeStreak(reviews,zone)} label="Day streak" tone="cream"/>
      <Tile icon={Target} value={reviews.length?Math.round(recalled/reviews.length*100)+'%':'—'} label="Non-Again ratings" tone="blue"/>
      <Tile icon={Clock} value={counts.size} label="Active study days" tone="peach"/>
      <Tile icon={Brain} value={data?.matureRetention.observedPercent===null?'—':data?.matureRetention.observedPercent+'%'} label={'Mature retention ('+(data?.matureRetention.eligible||0)+')'} tone="mint"/>
    </div>
    <div className="stats-grid">
      <section className="card"><h3>Review Heatmap</h3><p className="muted">Your last 12 weeks, in {zone}.</p>
        <div className="heatmap" role="img" aria-label="Daily review count for 12 weeks">{days.map(d=><span key={d.label} title={d.label+': '+d.count+' reviews'} className={'heat heat-'+(d.count===0?0:d.count<3?1:d.count<8?2:3)}/>)}</div>
        <p className="muted">No reviews · 1–2 · 3–7 · 8+ reviews</p>
      </section>
      <section className="card"><h3>Rating Breakdown</h3><p className="muted">Recent self-ratings, excluding undone reviews. Not a mature-review retention metric.</p>
        {['Again','Hard','Good','Easy'].map((name,i)=>{const count=reviews.filter(r=>r.rating===i+1).length;return <div className="breakdown" key={name}><span>{name}</span><div className="progress"><div style={{width:reviews.length?count/reviews.length*100+'%':'0%'}}/></div><strong>{count}</strong></div>;})}
      </section>
      <section className="card"><h3>Observed Mature Retention</h3>
        <p className="muted">Eligible: previously reviewed cards, due on or before the review, and at least 24 hours since the previous review. Immediate retries, first reviews and undone reviews do not count. Hard/Good/Easy are recalled; Again is not.</p>
        <strong>{data?.matureRetention.observedPercent===null?'Not enough eligible reviews':data?.matureRetention.observedPercent+'% recalled'}</strong>
        <p className="muted">Eligible sample: {data?.matureRetention.eligible||0} reviews, {data?.matureRetention.recalled||0} recalled. This is not FSRS target retention or typed-answer accuracy.</p>
        {data?.matureRetention.byDeck.map(row=><div key={row.deck} className="breakdown"><span>{row.deck}</span><strong>{row.observedPercent}% ({row.eligible})</strong></div>)}
      </section>
      <section className="card"><h3>Recorded Active Study Time</h3>
        <p><strong>{Math.round((data?.activeStudyMs||0)/60000)} minutes</strong></p>
        <p className="muted">Bounded, visible, recently active study intervals only. Not an independently verified timer.</p>
      </section>
      <section className="card"><h3>Due Forecast · Next 7 Days</h3><p className="muted">Currently scheduled future cards; counts may change after reviews.</p>
        {forecast.map(row=><div key={row.day} className="breakdown"><span>{row.day}</span><strong>{row.due} due</strong></div>)}
        {!forecast.length&&<p className="muted">No future cards scheduled in this window.</p>}
      </section>
      <section className="card"><h3>Reviews by Deck</h3>
        {Array.from(reviews.reduce((map,r)=>map.set(r.deck,(map.get(r.deck)||0)+1),new Map<string,number>())).map(([deck,count])=><div className="breakdown" key={deck}><span>{deck}</span><strong>{count}</strong></div>)}
        {!reviews.length&&<p className="muted">Study a card to start tracking progress.</p>}
      </section>
    </div></>;
}
function SettingsPage(){
  const {session,refresh}=useSession(),navigate=useNavigate();
  const {data:devices,reload:reloadDevices}=useResource<{sessions:{id:string;created_at:number;last_seen:number}[]}>('/sessions');
  const {data:preferences,reload:reloadPreferences}=useResource<{timezone:string}>('/preferences');
  const [timezone,setTimezone]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
  useEffect(()=>{if(preferences?.timezone&&!timezone)setTimezone(preferences.timezone);},[preferences,timezone]);
  async function saveTimezone(e:React.FormEvent){e.preventDefault();setError('');setMessage('');
    try{await api('/preferences',{method:'PUT',body:{timezone}});setMessage('Timezone saved. Daily review boundaries will now follow '+timezone+'.');reloadPreferences();}
    catch(e){setError(String(e));}
  }
  async function signOutAll(){if(!window.confirm('Sign out from every device?'))return;try{await api('/sessions/revoke-all',{method:'POST'});broadcastSessionChange();await refresh();void navigate({to:'/login'});}catch(e){setError(String(e));reloadDevices();}}
  async function revoke(id:string){setError('');try{await api('/sessions/revoke',{method:'POST',body:{id}});reloadDevices();await refresh();}catch(e){setError(String(e));}}
  return <><Heading title="Settings" subtitle="Your cards, your account, your rules."/>
    <div className="card form-card">
      <h2>Account</h2><p>Signed in as <strong>{session.user?.email}</strong></p>
      <p className="muted">All decks and reviews belong to your verified account.</p>
      <form onSubmit={e=>void saveTimezone(e)}>
        <label>Study timezone (IANA name)<input required value={timezone} onChange={e=>setTimezone(e.target.value)} placeholder="America/New_York"/></label>
        <p className="muted">Timezone controls daily streaks and sibling separation across daylight-saving transitions.</p>
        <button className="primary">Save Timezone</button>
      </form>
      {message&&<div className="success" role="status">{message}</div>}
      <div className="actions"><Link to="/migration/full" className="button secondary">Import CLI History</Link></div><h3>Device Sessions</h3>
      {devices?.sessions.map(d=><div className="breakdown" key={d.id}>
        <span>Last used {new Date(d.last_seen).toLocaleString()}</span>
        <button className="secondary" onClick={()=>void revoke(d.id)}>Revoke</button>
      </div>)}
      <div className="actions"><button className="danger" onClick={()=>void signOutAll()}>Sign out all devices</button></div>
      <Notice text={error}/>
    </div></>;
}

function HistoryMigrationPage(){
  const [bundle,setBundle]=useState<unknown>(null),[report,setReport]=useState<{sourceId:string;checksum:string;summary:{decks:number;notes:number;cards:number;schedules:number;reviews:number;undos:number}}|null>(null);
  const [approved,setApproved]=useState(false),[error,setError]=useState(''),[result,setResult]=useState('');
  const [busy,setBusy]=useState(false);
  async function select(file:File|undefined){
    if(!file)return;setError('');setReport(null);setBundle(null);setApproved(false);
    if(file.size>3_500_000){setError('History file exceeds the 3.5 MiB single-transaction limit.');return;}
    try{
      const parsed=JSON.parse(await file.text()) as unknown;
      setBundle(parsed);setBusy(true);
      const preview=await api<typeof report>('/migration/full/preview',{method:'POST',body:{bundle:parsed}});
      setReport(preview);
    }catch(e){setError(String(e));}finally{setBusy(false);}
  }
  async function importHistory(){
    if(!approved||!bundle||!report)return;setError('');setBusy(true);
    try{
      const r=await api<{duplicate:boolean;sourceId:string}>('/migration/full/commit',{method:'POST',body:{bundle,confirmation:'IMPORT_MY_HISTORY'}});
      setResult(r.duplicate?'This exact snapshot was already imported. No data was duplicated.':'Full history saved to this signed-in account. Existing decks were not replaced.');
    }catch(e){setError(String(e));}finally{setBusy(false);}
  }
  return <><Heading title="Import Your Study History" subtitle="Bring over your reviewed memories, not just your flashcard text."/>
    <div className="card form-card">
      <p>First export a private history file from the existing Vutadex CLI with <code>npm run export:legacy-history --workspace @vutadex/web -- /path/to/vutadex.db stable-source-id /private/history.json</code>.</p>
      <label>Choose your private history JSON file<input type="file" accept=".json,application/json" onChange={e=>void select(e.target.files?.[0])}/></label>
      <p className="muted">Only import files from your own CLI installation. Imported cards and schedules belong to the account currently signed in. Source schedules must use the matching FSRS version; image-occlusion media and larger archives need an approved migration path.</p>
      {report&&<div className="card">
        <h3>Review before importing</h3><p>Source: {report.sourceId}</p>
        <p>{report.summary.decks} decks, {report.summary.notes} logical notes, {report.summary.cards} cards, {report.summary.schedules} saved schedules, {report.summary.reviews} reviews, {report.summary.undos} undo events.</p>
        <label className="checkbox-line"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/> I own this local history and want to import it into this signed-in account.</label>
        <button className="primary" disabled={!approved||busy} onClick={()=>void importHistory()}>{busy?'Importing...':'Import My Full History'}</button>
      </div>}
      {result&&<div role="status" className="success">{result}</div>}<Notice text={error}/>
    </div></>;
}

function LoginPage(){const [email,setEmail]=useState('');const [sent,setSent]=useState(false);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [devLink,setDevLink]=useState('');async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{await api('/auth/magic-links',{method:'POST',body:{email}});setSent(true);try{const local=await api<{email:string;link:string}[]>('/dev/inbox');setDevLink(local.filter(x=>x.email===email.trim().toLowerCase()).at(-1)?.link||'');}catch{/* Production does not expose an inbox. */}}catch(e){setError(String(e));}finally{setBusy(false);}}return <div className="auth-card card"><Bongo size="large" mood="hype"/><h1>Welcome to Vutadex.</h1><p>Small cards. Big brain energy.</p>{sent?<><div className="success" role="status">If that email can receive messages, your sign-in link is on its way.</div>{devLink&&<a href={devLink} className="button primary">Open local dev sign-in link</a>}<button onClick={()=>setSent(false)} className="secondary">Try another email</button></>:<form onSubmit={e=>void submit(e)}><label>Email address<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><button disabled={busy} className="primary"><Mail size={19}/>{busy?'Sending...':'Send magic link'}</button></form>}<Notice text={error}/><small>Sign in on desktop and phone with the same email to use your saved collection.</small></div>;}
function VerifyPage(){const {refresh}=useSession();const navigate=useNavigate();const [secret]=useState(()=>{const params=new URLSearchParams(window.location.hash.slice(1));const t=params.get('token')||'';window.history.replaceState(null,'',window.location.pathname);return t;});const [busy,setBusy]=useState(false);const [error,setError]=useState('');async function confirm(){setBusy(true);try{await api('/auth/magic-links/consume',{method:'POST',body:{token:secret}});await refresh();void navigate({to:'/'});}catch(e){setError(String(e));}finally{setBusy(false);}}return <div className="auth-card card"><Bongo mood="thinking"/><h1>Confirm sign-in</h1><p>Ready to let Bongo into your brain?</p>{secret?<button className="primary" disabled={busy} onClick={()=>void confirm()}>{busy?'Confirming...':'Confirm sign-in'}</button>:<p className="notice">This link is missing its token.</p>}<Notice text={error}/><Link to="/login" className="text-link">Request another link</Link></div>;}
function Loading(){return <div className="loading" role="status"><LoaderCircle className="spin"/> Bongo is retrieving your cards...</div>;}
createRoot(document.getElementById('root')!).render(<React.StrictMode><RouterProvider router={router}/></React.StrictMode>);
