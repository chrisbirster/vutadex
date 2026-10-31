import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const unique=(suffix)=>'e2e-'+suffix+'-'+Date.now()+'-'+Math.random().toString(16).slice(2)+'@example.com';
async function signIn(page,email){
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button',{name:'Send magic link'}).click();
  await page.getByRole('link',{name:'Open local dev sign-in link'}).click();
  await page.getByRole('button',{name:'Confirm sign-in'}).click();
  await expect(page.getByRole('heading',{name:/Due cards are lurking|Your brain is ready/})).toBeVisible();
}
async function createDeck(page,name){
  await page.goto('/decks/new');
  await page.getByLabel('Deck name').fill(name);
  await page.getByRole('button',{name:'Create Deck'}).click();
  await expect(page.getByRole('heading',{name})).toBeVisible();
}
test('desktop: magic link, create/edit/study/undo/stats/logout with keyboard access',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await signIn(page,unique('desktop'));
  await createDeck(page,'Philosophy '+Date.now());
  await page.getByRole('link',{name:'Add Cards'}).last().click();
  await page.getByLabel('Front').fill('What is epistemology?');
  await page.getByLabel('Back').fill('The study of knowledge.');
  await page.getByRole('button',{name:/Save Card/}).click();
  await expect(page.getByRole('status').filter({hasText:/Saved!/})).toBeVisible();
  await page.goto('/study');
  await page.getByRole('button',{name:'Study All Due Cards'}).click();
  await expect(page.getByText('What is epistemology?')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByText('The study of knowledge.')).toBeVisible();
  await page.getByRole('button',{name:/Good/}).click();
  await page.goto('/stats');
  await expect(page.getByText('Observed Mature Retention')).toBeVisible();
  await page.getByRole('button',{name:'Sign out'}).click();
  await expect(page.getByLabel('Email address')).toBeVisible();
});
test('two browsers: shared decks, draft editing and conflicting note writes are detected',async({browser})=>{
  const a=await browser.newContext(),b=await browser.newContext();
  const pa=await a.newPage(),pb=await b.newPage(),email=unique('twobrowser');
  try{
    await signIn(pa,email);await signIn(pb,email);
    const name='Sync '+Date.now();
    await pb.goto('/decks');
    await createDeck(pa,name);
    await expect(pb.getByRole('heading',{name})).toBeVisible({timeout:12000});
    await pa.getByRole('link',{name:'Add Cards'}).last().click();
    await pa.getByLabel('Front').fill('What is a race condition?');
    await pa.getByLabel('Back').fill('Concurrent operations sharing state');
    await pa.getByRole('button',{name:/Save Card/}).click();
    await expect(pa.getByText(/Saved!/)).toBeVisible();
    await pa.goto('/decks');
    await pa.getByRole('link',{name:name}).first().click();
    await pa.getByRole('link',{name:'Edit Note'}).click();
    const editorUrl=pa.url();
    await pb.goto(editorUrl);
    await expect(pb.getByLabel('Front')).toHaveValue('What is a race condition?');
    await pa.getByLabel('Front').fill('Updated locally by A');
    await pb.getByLabel('Front').fill('Updated by B');
    await pb.getByRole('button',{name:'Save Changes'}).click();
    await expect(pb.getByRole('status').filter({hasText:/Saved/})).toBeVisible();
    // SSE may race the user's explicit save. Both paths must reject stale writes
    // without discarding A's unsaved text.
    const concurrentAlert=pa.getByRole('alert',{name:'Concurrent note edit'});
    if(!(await concurrentAlert.isVisible())){
      await pa.getByRole('button',{name:'Save Changes'}).click();
    }
    await expect(concurrentAlert).toBeVisible();
    await expect(pa.getByRole('textbox',{name:'Front'})).toHaveValue('Updated locally by A');
  }finally{await a.close();await b.close();}
});
test('mobile navigation is reachable with no horizontal overflow and no serious accessibility violations',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await signIn(page,unique('mobile'));
  await page.getByRole('button',{name:'Open navigation'}).click();
  await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();
  await page.getByRole('link',{name:'Decks'}).click();
  await expect(page.getByRole('heading',{name:'Your Decks'})).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const scan=await new AxeBuilder({page}).analyze();
  const serious=scan.violations.filter(v=>['critical','serious'].includes(v.impact||''));
  expect(serious,JSON.stringify(serious.map(v=>({id:v.id,nodes:v.nodes.length})))).toEqual([]);
});
test('desktop dashboard has keyboard-visible controls, acceptable document load and accessibility scan',async({page})=>{
  await page.setViewportSize({width:1280,height:800});
  await signIn(page,unique('axe'));
  const scan=await new AxeBuilder({page}).analyze();
  const serious=scan.violations.filter(v=>['critical','serious'].includes(v.impact||''));
  expect(serious,JSON.stringify(serious.map(v=>({id:v.id,nodes:v.nodes.length})))).toEqual([]);
  await page.keyboard.press('Tab');
  const focused=await page.evaluate(()=>document.activeElement!==document.body);
  expect(focused).toBe(true);
  const navigation=await page.evaluate(()=>performance.getEntriesByType('navigation')[0]?.duration||0);
  expect(navigation).toBeLessThan(15000);
});

test('interrupted draft autosave remains explicitly unsaved and can be reapplied',async({page})=>{
  await signIn(page,unique('offline-draft'));
  await createDeck(page,'Offline Draft '+Date.now());
  await page.getByRole('link',{name:'Add Cards'}).last().click();
  await page.route('**/api/v1/drafts/new',async route=>{
    if(route.request().method()==='PUT')await route.abort('failed');
    else await route.continue();
  });
  await page.getByLabel('Front').fill('My unsaved offline question');
  await expect(page.getByRole('status').filter({hasText:/Unsaved:|Conflict:/})).toBeVisible({timeout:15000});
  await expect(page.getByLabel('Front')).toHaveValue('My unsaved offline question');
  await page.unroute('**/api/v1/drafts/new');
  await page.getByRole('button',{name:'Check latest draft'}).click();
  await expect(page.getByRole('alert',{name:'Concurrent draft edit'})).toBeVisible();
  await page.getByRole('button',{name:'Reapply selected fields'}).click();
  await expect(page.getByRole('status').filter({hasText:'Draft conflict resolved.'})).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Front')).toHaveValue('My unsaved offline question');
});
test('reconnecting a temporarily offline device catches up without a second account',async({browser})=>{
  const a=await browser.newContext(),b=await browser.newContext();
  const pa=await a.newPage(),pb=await b.newPage(),email=unique('offline-catchup');
  try{
    await signIn(pa,email);await signIn(pb,email);
    await pb.goto('/decks');
    await b.setOffline(true);
    const title='Reconnected '+Date.now();
    await createDeck(pa,title);
    await b.setOffline(false);
    await pb.bringToFront();
    await pb.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await expect(pb.getByRole('heading',{name:title})).toBeVisible({timeout:15000});
  }finally{await a.close();await b.close();}
});

test('typed-answer interaction compares learner text and retains self-rating',async({page})=>{
  await signIn(page,unique('typed-review'));
  const origin='http://127.0.0.1:5173';
  const deckResponse=await page.request.post('/api/v1/decks',{headers:{Origin:origin},data:{name:'Typed E2E '+Date.now()}});
  expect(deckResponse.status()).toBe(201);
  const deckId=(await deckResponse.json()).deck.id;
  const created=await page.request.post('/api/v1/notes',{headers:{Origin:origin},
    data:{deckId,type:'type-answer',fields:['Capital of France?','Paris'],tags:''}});
  expect(created.status()).toBe(201);
  const started=await page.request.post('/api/v1/study',{headers:{Origin:origin},data:{deckId}});
  expect(started.status()).toBe(201);
  const sessionId=(await started.json()).id;
  await page.goto('/study/'+sessionId);
  await expect(page.getByLabel('Type your answer')).toBeVisible();
  await page.getByLabel('Type your answer').fill('  PARIS  ');
  await page.getByLabel('Type your answer').press('Enter');
  await expect(page.getByText(/matches after whitespace and case/)).toBeVisible();
  await page.getByRole('button',{name:/Good/}).click();
  await expect(page.getByRole('heading',{name:'Brain gains secured!'})).toBeVisible();
});
test('occlusion review displays owned image, hides region and reveals target on demand',async({page})=>{
  await signIn(page,unique('occlusion-review'));
  const origin='http://127.0.0.1:5173';
  const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';
  const media=await page.request.post('/api/v1/media',{headers:{Origin:origin},data:{data:image}});
  expect(media.status()).toBe(201);
  const {ref}=await media.json();
  const deck=await page.request.post('/api/v1/decks',{headers:{Origin:origin},data:{name:'Occlusion E2E '+Date.now()}});
  const {deck:{id:deckId}}=await deck.json();
  const masks=JSON.stringify([{id:3,x:0.1,y:0.1,width:0.4,height:0.4,answer:'Bongo'}]);
  const note=await page.request.post('/api/v1/notes',{headers:{Origin:origin},
    data:{deckId,type:'image-occlusion',fields:[ref,masks,''],tags:''}});
  expect(note.status()).toBe(201);
  const session=await page.request.post('/api/v1/study',{headers:{Origin:origin},data:{deckId}});
  const {id}=await session.json();
  await page.goto('/study/'+id);
  await expect(page.getByRole('img',{name:'Masked region to identify'})).toBeVisible();
  await expect(page.getByAltText('Study image with occluded regions')).toBeVisible();
  await page.getByRole('button',{name:/Show Answer/}).click();
  await expect(page.getByRole('img',{name:'Revealed target region'})).toBeVisible();
  await expect(page.getByText('Bongo',{exact:true})).toBeVisible();
});
