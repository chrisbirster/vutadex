import {readdirSync,readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {gzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {tmpdir} from 'node:os';
import {performance} from 'node:perf_hooks';

const dist=resolve(import.meta.dirname,'../dist');
function collect(path:string):string[]{
  return readdirSync(path,{withFileTypes:true}).flatMap(file=>file.isDirectory()?collect(join(path,file.name)):[join(path,file.name)]);
}
const files=collect(dist),script=files.filter(f=>f.endsWith('.js')),styles=files.filter(f=>f.endsWith('.css'));
if(!script.length||!styles.length)throw new Error('Frontend assets missing');
const size=(paths:string[])=>paths.reduce((n,p)=>n+gzipSync(readFileSync(p)).byteLength,0);
const js=size(script),css=size(styles);
if(js>500*1024||css>100*1024||js+css>650*1024)throw new Error('Frontend gzip budget exceeded');
const tmp=mkdtempSync(join(tmpdir(),'vutadex-perf-'));
try{
  const db=new DatabaseSync(join(tmp,'perf.db'));
  db.exec('CREATE TABLE cards(id INTEGER PRIMARY KEY,owner_id TEXT NOT NULL,due_at INTEGER NOT NULL,front TEXT NOT NULL);CREATE INDEX cards_due ON cards(owner_id,due_at);BEGIN IMMEDIATE');
  const add=db.prepare('INSERT INTO cards(owner_id,due_at,front) VALUES(?,?,?)');
  for(let i=0;i<120000;i++)add.run(i%3?'account-a':'account-b',i%10000,'Card '+i);
  db.exec('COMMIT');
  const plan=db.prepare('EXPLAIN QUERY PLAN SELECT id FROM cards WHERE owner_id=? AND due_at<=? ORDER BY due_at LIMIT 100')
    .all('account-a',9999) as {detail:string}[];
  if(!plan.some(x=>/USING (COVERING )?INDEX/i.test(x.detail)))throw new Error('Due-card query must use owner/due index: '+JSON.stringify(plan));
  const q=db.prepare('SELECT id FROM cards WHERE owner_id=? AND due_at<=? ORDER BY due_at LIMIT 100');
  const start=performance.now();
  for(let i=0;i<750;i++)q.all('account-a',5000);
  const elapsed=performance.now()-start;
  if(elapsed>10000)throw new Error('Due-card query workload exceeded 10s');
  db.close();
  console.log(JSON.stringify({gzipJsBytes:js,gzipCssBytes:css,seededCards:120000,dueQueryRuns:750,elapsedMs:Math.round(elapsed)},null,2));
}finally{rmSync(tmp,{recursive:true,force:true});}
