import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createRootRoute, createRoute, createRouter, Link, Outlet, RouterProvider, useNavigate, useRouterState } from '@tanstack/react-router';
import { useImmer } from 'use-immer';
import { Home, Layers3, Play, SquarePlus, ChartNoAxesColumnIncreasing, Settings, Search, LogOut, Sparkles, Flame, BookOpen, Plus, ArrowRight, Eye, RotateCcw, Check, Clock, Target, ChevronLeft, ChevronRight, Keyboard, Mail, LoaderCircle, Brain, Menu, X, Download, PanelLeft, CircleHelp } from 'lucide-react';
import './style.css';

type User = {id:string;email:string};
type Deck = {id:string;name:string;description:string;created_at?:number;cards?:number;due?:number};
type Note = {id:string;type:string;front:string;back:string;tags:string;created_at:number;revision:number};
type Review = {rating:number;created_at:number;deck:string};
type Overview = {decks:Deck[];due:number;cards:number;reviews:Review[]};
type Study = {card:{id:string;front:string;back:string;due_at:number}|null;position:number;total:number;revision:number;waiting:number;paused:boolean;intervals:{rating:number;intervalMs:number;dueAt:number}[]};
type SessionState = {user:User|null;loading:boolean;error:string};
type SessionContextValue={session:SessionState;refresh:()=>Promise<void>};
const SessionContext=createContext<SessionContextValue|null>(null);
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
async function api<T>(path:string, options?:{method?:string;body?:unknown;signal?:AbortSignal}):Promise<T>{
  const response=await fetch('/api/v1'+path,{method:options?.method||'GET',credentials:'same-origin',signal:options?.signal,headers:options?.body===undefined?{}:{'content-type':'application/json'},body:options?.body===undefined?undefined:JSON.stringify(options.body)});
  let payload:unknown;
  try{payload=await response.json();}catch{throw new Error('Unable to reach Vutadex. Check your connection.');}
  if(!response.ok)throw new Error(typeof payload==='object'&&payload!==null&&'error' in payload?String((payload as {error:unknown}).error):'Request failed');
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
const routeCardNew=createRoute({getParentRoute:()=>routeRoot,path:'/cards/new',validateSearch:(search:Record<string,unknown>)=>({deckId:typeof search.deckId==='string'?search.deckId:undefined}),component:CardEditorPage});
const routeStudy=createRoute({getParentRoute:()=>routeRoot,path:'/study',component:StudyStartPage});
const routeStudySession=createRoute({getParentRoute:()=>routeRoot,path:'/study/$sessionId',component:StudySessionPage});
const routeStats=createRoute({getParentRoute:()=>routeRoot,path:'/stats',component:StatsPage});
const routeSettings=createRoute({getParentRoute:()=>routeRoot,path:'/settings',component:SettingsPage});
const routeTree=routeRoot.addChildren([routeHome,routeLogin,routeVerify,routeDecks,routeDeckNew,routeDeckDetail,routeCardNew,routeNoteEdit,routeImport,routeStudy,routeStudySession,routeStats,routeSettings]);
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
  const path=useRouterState({select:s=>s.location.pathname});
  const [mobileNav,setMobileNav]=useState(false);
  const authPage=path==='/login'||path==='/auth/verify';
  const navigate=useNavigate();
  useEffect(()=>setMobileNav(false),[path]);
  if(session.loading)return <div className="center-screen"><Bongo/><p>Waking up Bongo...</p></div>;
  if(!session.user&&!authPage)return <LoginPage/>;
  if(authPage)return <SessionContext.Provider value={{session,refresh}}><main className="auth-background"><Outlet/></main></SessionContext.Provider>;
  const signOut=async()=>{await api('/logout',{method:'POST'});setSession({user:null,loading:false,error:''});void navigate({to:'/login'});};
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
  const streak=computeStreak(overview.reviews);
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
function DeckDetailPage(){const {deckId}=routeDeckDetail.useParams();const {data,loading,error}=useResource<{deck:Deck;notes:Note[]}>('/decks/'+encodeURIComponent(deckId));const navigate=useNavigate();if(loading)return <Loading/>;if(error)return <Notice text={error}/>;const deck=data!.deck;return <><Heading title={deck.name} subtitle={deck.description||'Every card counts.'}/><div className="actions"><Link className="button primary" to="/cards/new" search={{deckId}}><Plus/> Add Cards</Link><button className="secondary" onClick={()=>void startStudy(navigate,deckId)}><Play/> Study Deck</button><a className="button secondary" href={"/api/v1/decks/"+encodeURIComponent(deckId)+"/export"}><Download/> Export .deck</a></div><div className="section-heading"><h2>Notes ({data!.notes.length})</h2></div>{data!.notes.length?<div className="notes-list">{data!.notes.map(n=><div className="note-row card" key={n.id}><div><small className="pill">{n.type}</small><h3>{n.front}</h3><p>{n.back||'Cloze card'}</p><small>{n.tags}</small><div className="actions"><Link className="button secondary" to="/notes/$noteId/edit" params={{noteId:n.id}}>Edit Note</Link></div></div></div>)}</div>:<Empty title="No cards yet" message="Feed the knowledge goblin with your first note." action={<Link className="button primary" to="/cards/new" search={{deckId}}>Add Cards</Link>}/>}</>;}
function CardEditorPage(){const {deckId}=routeCardNew.useSearch();const {data,loading}=useResource<{decks:Deck[]}>('/decks');const [form,setForm]=useImmer({deckId:deckId||'',type:'basic',front:'',back:'',tags:''});const [error,setError]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  useEffect(()=>{if(deckId)setForm(s=>{s.deckId=deckId;});},[deckId,setForm]);
  async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');setMessage('');try{const result=await api<{generatedCards:number}>('/notes',{method:'POST',body:form});setMessage('Saved! '+result.generatedCards+' card(s) ready to study.');setForm(s=>{s.front='';s.back='';s.tags='';});}catch(e){setError(String(e));}finally{setBusy(false);}}
  return <><Heading title="Add a New Card" subtitle="Feed the knowledge goblin. Weaponize your neurons." mood="hype"/><div className="editor-grid"><form className="card editor" onSubmit={e=>void save(e)}><h3><span className="step">1</span> Choose a Deck</h3>{loading?<p>Loading decks...</p>:<select required value={form.deckId} onChange={e=>setForm(s=>{s.deckId=e.target.value;})}><option value="">Select a deck</option>{data?.decks.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>}<Link to="/decks/new" className="text-link">Create a new deck <Plus size={14}/></Link><h3><span className="step step-blue">2</span> Card Type</h3><div className="type-grid">{(['basic','reverse','cloze'] as const).map(t=><button type="button" className={'type-button '+(form.type===t?'selected':'')} key={t} aria-pressed={form.type===t} onClick={()=>setForm(s=>{s.type=t;})}><Layers3 size={19}/><strong>{t==='cloze'?'Cloze':t==='reverse'?'Reverse':'Basic'}</strong><small>{t==='cloze'?'Fill in the blank':t==='reverse'?'Both ways':'Front → Back'}</small></button>)}</div><h3><span className="step step-amber">3</span> Card Content</h3><div className="field-grid"><label>{form.type==='cloze'?'Text with {{c1::answer}}':'Front'}<textarea required maxLength={6000} rows={6} placeholder={form.type==='cloze'?'The {{c1::capital}} of France is Paris.':'What is the question?'} value={form.front} onChange={e=>setForm(s=>{s.front=e.target.value;})}/></label><label>{form.type==='cloze'?'Extra (optional)':'Back'}<textarea required={form.type!=='cloze'} maxLength={6000} rows={6} placeholder="What's the answer?" value={form.back} onChange={e=>setForm(s=>{s.back=e.target.value;})}/></label></div><label>Tags (optional)<input value={form.tags} maxLength={300} onChange={e=>setForm(s=>{s.tags=e.target.value;})} placeholder="philosophy, basics, things Bongo knows"/></label><Notice text={error}/>{message&&<div className="success" role="status">{message}</div>}<button disabled={busy} className="primary"><Sparkles size={18}/> {busy?'Saving...':'Save Card'}</button></form><aside className="editor-side"><div className="card preview"><h3><Eye size={20}/> Live Preview</h3><div className="preview-front">{form.front||'Your card front will appear here...'}</div><div className="preview-back">{form.back||'Your answer will appear here...'}</div><Bongo mood="happy"/></div><div className="card"><h3><CircleHelp size={20}/> Card Writing Tips</h3><p>One idea per card. Short, specific questions stick.</p><p>Use your own words. Future you says thanks.</p><p>Cloze example: <code>{'{{c1::answer}}'}</code>.</p></div></aside></div></>;
}

function EditNotePage(){
  const {noteId}=routeNoteEdit.useParams();
  const {data,loading,error,reload}=useResource<{note:{id:string;deckId:string;type:string;front:string;back:string;tags:string;revision:number}}>('/notes/'+encodeURIComponent(noteId));
  const [form,setForm]=useImmer({type:'basic',front:'',back:'',tags:'',revision:0});
  const [initialized,setInitialized]=useState(false);
  const [message,setMessage]=useState(''),[failure,setFailure]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{if(data?.note){setForm({type:data.note.type,front:data.note.front,back:data.note.back,tags:data.note.tags,revision:data.note.revision});setInitialized(true);}},[data,setForm]);
  async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setFailure('');setMessage('');try{
    const result=await api<{note:{revision:number}}>('/notes/'+encodeURIComponent(noteId),{method:'PUT',body:form});
    setForm(d=>{d.revision=result.note.revision;});
    setMessage('Saved. Existing generated cards kept their review history.');
  }catch(e){setFailure(String(e));}finally{setBusy(false);}}
  if(loading||!initialized)return <Loading/>;
  if(error)return <Notice text={error}/>;
  return <><Heading title="Edit Note" subtitle="Fine-tune your knowledge without losing your brain gains."/>
    <form className="card form-card" onSubmit={e=>void save(e)}>
      <label>Note type<select value={form.type} onChange={e=>setForm(d=>{d.type=e.target.value;})}><option value="basic">Basic</option><option value="reverse">Reverse</option><option value="cloze">Cloze</option></select></label>
      <label>Front<textarea required rows={6} maxLength={6000} value={form.front} onChange={e=>setForm(d=>{d.front=e.target.value;})}/></label>
      <label>Back<textarea required={form.type!=='cloze'} rows={6} maxLength={6000} value={form.back} onChange={e=>setForm(d=>{d.back=e.target.value;})}/></label>
      <label>Tags<input maxLength={300} value={form.tags} onChange={e=>setForm(d=>{d.tags=e.target.value;})}/></label>
      <p className="muted">Revision {form.revision}. Saving uses optimistic concurrency; a concurrent edit is rejected instead of overwritten.</p>
      <Notice text={failure}/>{message&&<div className="success" role="status">{message}</div>}
      <div className="actions"><button className="primary" disabled={busy}>{busy?'Saving...':'Save Changes'}</button><button type="button" className="secondary" onClick={()=>{reload();setFailure('');}}>Reload Latest</button><Link className="button secondary" to="/decks/$deckId" params={{deckId:data!.note.deckId}}>Back to Deck</Link></div>
    </form></>;
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
    <Notice text={error}/></div></>;
}
function StudyStartPage(){const {data,loading}=useResource<Overview>('/overview');const navigate=useNavigate();const [busy,setBusy]=useState(false);const [error,setError]=useState('');async function start(id?:string){setBusy(true);setError('');try{await startStudy(navigate,id);}catch(e){setError(String(e));}finally{setBusy(false);}}return <><Heading title="Study Time!" subtitle="Same cards. A smarter you. Bongo believes in you." mood="hype"/><div className="section-heading"><h2>Choose your battlefield</h2></div><Notice text={error}/><button className="primary" disabled={busy} onClick={()=>void start()}><Play/> Study All Due Cards</button>{loading?<Loading/>:<div className="deck-grid study-decks">{data?.decks.map((d,i)=><button key={d.id} className={'deck-card deck-tone-'+i%4} disabled={busy} onClick={()=>void start(d.id)}><div className="deck-info"><h3>{d.name}</h3><p>{d.due||0} cards due now</p><div className="deck-bottom">Study this deck <ArrowRight/></div></div></button>)}</div>}</>;}
async function startStudy(navigate:ReturnType<typeof useNavigate>,deckId?:string){const r=await api<{id:string}>('/study',{method:'POST',body:deckId?{deckId}:{}});await navigate({to:'/study/$sessionId',params:{sessionId:r.id}});}
function humanInterval(ms:number):string{
  if(ms<3600000)return Math.max(1,Math.round(ms/60000))+'m';
  if(ms<86400000)return Math.max(1,Math.round(ms/3600000))+'h';
  return Math.max(1,Math.round(ms/86400000))+'d';
}
function StudySessionPage(){const {sessionId}=routeStudySession.useParams();const {data,loading,error,reload}=useResource<Study>('/study/'+encodeURIComponent(sessionId));const [revealed,setRevealed]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [canUndo,setCanUndo]=useState(false);const rate=async(rating:number)=>{if(!data?.card||!revealed||busy)return;setBusy(true);setMessage('');try{await api('/study/'+encodeURIComponent(sessionId)+'/rate',{method:'POST',body:{rating,revision:data.revision,operationId:crypto.randomUUID()}});setRevealed(false);setCanUndo(true);reload();}catch(e){setMessage(String(e));reload();}finally{setBusy(false);}};
  useEffect(()=>{const handle=(e:KeyboardEvent)=>{if(['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement)?.tagName))return;if(e.code==='Space'&&!revealed){e.preventDefault();setRevealed(true);}if(revealed&&['1','2','3','4'].includes(e.key)){e.preventDefault();void rate(Number(e.key));}};window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle);},[revealed,busy,data,sessionId]);
  async function updateSession(action:'pause'|'resume'|'undo'){
    if(!data)return;setBusy(true);setMessage('');
    try{await api('/study/'+encodeURIComponent(sessionId)+'/'+action,{method:'POST',body:{revision:data.revision}});
      if(action==='undo'){setCanUndo(false);setRevealed(false);}reload();
    }catch(e){setMessage(String(e));reload();}finally{setBusy(false);}
  }
  if(loading)return <Loading/>;if(error)return <Notice text={error}/>;if(!data?.card)return <><Heading title="Brain gains secured!" subtitle="You cleared the queue. Bongo is proud of you." mood="hype"/><Empty title="All done for now" message="Come back when more cards are due." action={<Link className="button primary" to="/">Back to home</Link>}/></>;
  return <><Heading title="Study Session" subtitle="A slightly smarter you, one card at a time." mood="thinking"/><div className="study-controls actions">
      <button className="secondary" disabled={busy} onClick={()=>void updateSession(data.paused?'resume':'pause')}>{data.paused?'Resume Session':'Pause Session'}</button>
      {canUndo&&<button className="secondary" disabled={busy} onClick={()=>void updateSession('undo')}><RotateCcw size={17}/> Undo Last Rating</button>}
    </div><div className="study-layout"><div><div className="progress-label">Card {data.position+1} of {data.total}<span>{Math.round(data.position/Math.max(1,data.total)*100)}%</span></div><div className="progress"><div style={{width:String(data.position/Math.max(1,data.total)*100)+'%'}}/></div><div className="study-card card"><small className="pill">Question</small><h2>{data.card.front}</h2>{revealed&&<div className="answer"><span className="eyebrow">THE REVEAL</span><p>{data.card.back}</p></div>}</div>{data.paused?<div className="waiting"><Clock/> Session paused. Resume to continue.</div>:data.waiting>0?<div className="waiting"><Clock/> This card returns in about {Math.ceil(data.waiting/1000)} seconds. <button className="secondary" onClick={reload}>Check again</button></div>:!revealed?<button className="primary reveal" onClick={()=>setRevealed(true)}><Eye/> Show Answer <kbd>Space</kbd></button>:<div className="rating-grid">{([{name:'Again',key:1,subtitle:'Forgot it',tone:'peach'},{name:'Hard',key:2,subtitle:'Still fuzzy',tone:'cream'},{name:'Good',key:3,subtitle:'Mostly got it',tone:'mint'},{name:'Easy',key:4,subtitle:'Knew it well',tone:'blue'}] as const).map(r=><button disabled={busy} key={r.key} className={'rating rating-'+r.tone} onClick={()=>void rate(r.key)}><Bongo mood={r.key===1?'sleepy':r.key===2?'thinking':r.key===4?'hype':'happy'}/><strong>{r.name}</strong><kbd>{r.key}</kbd><small>{r.subtitle} · {data.intervals.find(x=>x.rating===r.key)?humanInterval(data.intervals.find(x=>x.rating===r.key)!.intervalMs):'—'}</small></button>)}</div>}<Notice text={message}/></div><aside className="study-aside"><div className="card"><h3>Session Progress</h3><Tile icon={Layers3} value={data.total-data.position} label="Remaining" tone="mint"/><Tile icon={Check} value={data.position} label="Reviewed" tone="cream"/></div><div className="mascot-note"><Bongo mood="happy"/><p>FOCUS MODE: BONGO BELIEVES IN YOU.</p></div></aside></div></>;
}
function StatsPage(){const {data,loading,error}=useResource<{reviews:Review[]}>('/stats');if(loading)return <Loading/>;if(error)return <Notice text={error}/>;const reviews=data?.reviews||[];const counts=new Map<string,number>();for(const r of reviews){const d=new Date(r.created_at).toLocaleDateString('en-CA');counts.set(d,(counts.get(d)||0)+1);}const days=Array.from({length:84},(_,i)=>{const d=new Date();d.setDate(d.getDate()-83+i);return {label:d.toLocaleDateString('en-CA'),count:counts.get(d.toLocaleDateString('en-CA'))||0};});const daysWithReviews=new Set(reviews.map(r=>new Date(r.created_at).toLocaleDateString('en-CA'))).size;const recalled=reviews.filter(r=>r.rating!==1).length;return <><Heading title="Your Brain's Progress" subtitle="Small steps add up. Bongo is keeping score." mood="hype"/><div className="metrics-row"><Tile icon={BookOpen} value={reviews.length} label="Recent reviews" tone="mint"/><Tile icon={Flame} value={computeStreak(reviews)} label="Day streak" tone="cream"/><Tile icon={Target} value={reviews.length?Math.round(recalled/reviews.length*100)+'%':'—'} label="Non-Again ratings" tone="blue"/><Tile icon={Clock} value={daysWithReviews} label="Active study days" tone="peach"/></div><div className="stats-grid"><section className="card"><h3>Review Heatmap</h3><p className="muted">The last 12 weeks. Darker squares mean more reviews.</p><div className="heatmap" role="img" aria-label="Daily review activity over the past 12 weeks">{days.map(d=><span key={d.label} title={d.label+': '+d.count+' reviews'} className={'heat heat-'+(d.count===0?0:d.count<3?1:d.count<8?2:3)}/>)}</div><p className="muted">No reviews · 1–2 · 3–7 · 8+ reviews</p></section><section className="card"><h3>Rating Breakdown</h3><p className="muted">Actual self-ratings from your last {reviews.length} reviews; not an estimated retention score.</p>{['Again','Hard','Good','Easy'].map((name,i)=>{const count=reviews.filter(r=>r.rating===i+1).length;return <div className="breakdown" key={name}><span>{name}</span><div className="progress"><div style={{width:reviews.length?count/reviews.length*100+'%':'0%'}}/></div><strong>{count}</strong></div>;})}</section><section className="card"><h3>Reviews by Deck</h3>{Array.from(reviews.reduce((map,r)=>map.set(r.deck,(map.get(r.deck)||0)+1),new Map<string,number>())).map(([deck,count])=><div className="breakdown" key={deck}><span>{deck}</span><strong>{count}</strong></div>)}{!reviews.length&&<p className="muted">Start reviewing to see real data here.</p>}</section><section className="mascot-note"><Bongo mood="sleepy"/><p>THE FORGETTING CURVE FEARS YOU (eventually).</p></section></div></>;}
function computeStreak(reviews:Review[]):number{const days=new Set(reviews.map(r=>new Date(r.created_at).toLocaleDateString('en-CA')));let streak=0;const d=new Date();if(!days.has(d.toLocaleDateString('en-CA')))d.setDate(d.getDate()-1);while(days.has(d.toLocaleDateString('en-CA'))){streak++;d.setDate(d.getDate()-1);}return streak;}
function SettingsPage(){const {session,refresh}=useSession();const navigate=useNavigate();const {data,reload}=useResource<{sessions:{id:string;created_at:number;last_seen:number}[]}>('/sessions');const [error,setError]=useState('');async function signOutAll(){if(!window.confirm('Sign out from every device?'))return;try{await api('/sessions/revoke-all',{method:'POST'});await refresh();void navigate({to:'/login'});}catch(e){setError(String(e));reload();}}return <><Heading title="Settings" subtitle="Your cards, your account, your rules."/><div className="card form-card"><h2>Account</h2><p>Signed in as <strong>{session.user?.email}</strong></p><p className="muted">Saved decks and reviews belong to this account.</p><h3>Sessions</h3>{data?.sessions.map(s=><p key={s.id}>Device session · last used {new Date(s.last_seen).toLocaleString()}</p>)}<button className="danger" onClick={()=>void signOutAll()}>Sign out all devices</button><Notice text={error}/></div></>;}
function LoginPage(){const [email,setEmail]=useState('');const [sent,setSent]=useState(false);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [devLink,setDevLink]=useState('');async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{await api('/auth/magic-links',{method:'POST',body:{email}});setSent(true);try{const local=await api<{email:string;link:string}[]>('/dev/inbox');setDevLink(local.filter(x=>x.email===email.trim().toLowerCase()).at(-1)?.link||'');}catch{/* Production does not expose an inbox. */}}catch(e){setError(String(e));}finally{setBusy(false);}}return <div className="auth-card card"><Bongo size="large" mood="hype"/><h1>Welcome to Vutadex.</h1><p>Small cards. Big brain energy.</p>{sent?<><div className="success" role="status">If that email can receive messages, your sign-in link is on its way.</div>{devLink&&<a href={devLink} className="button primary">Open local dev sign-in link</a>}<button onClick={()=>setSent(false)} className="secondary">Try another email</button></>:<form onSubmit={e=>void submit(e)}><label>Email address<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><button disabled={busy} className="primary"><Mail size={19}/>{busy?'Sending...':'Send magic link'}</button></form>}<Notice text={error}/><small>Sign in on desktop and phone with the same email to use your saved collection.</small></div>;}
function VerifyPage(){const {refresh}=useSession();const navigate=useNavigate();const [secret]=useState(()=>{const params=new URLSearchParams(window.location.hash.slice(1));const t=params.get('token')||'';window.history.replaceState(null,'',window.location.pathname);return t;});const [busy,setBusy]=useState(false);const [error,setError]=useState('');async function confirm(){setBusy(true);try{await api('/auth/magic-links/consume',{method:'POST',body:{token:secret}});await refresh();void navigate({to:'/'});}catch(e){setError(String(e));}finally{setBusy(false);}}return <div className="auth-card card"><Bongo mood="thinking"/><h1>Confirm sign-in</h1><p>Ready to let Bongo into your brain?</p>{secret?<button className="primary" disabled={busy} onClick={()=>void confirm()}>{busy?'Confirming...':'Confirm sign-in'}</button>:<p className="notice">This link is missing its token.</p>}<Notice text={error}/><Link to="/login" className="text-link">Request another link</Link></div>;}
function Loading(){return <div className="loading" role="status"><LoaderCircle className="spin"/> Bongo is retrieving your cards...</div>;}
createRoot(document.getElementById('root')!).render(<React.StrictMode><RouterProvider router={router}/></React.StrictMode>);
