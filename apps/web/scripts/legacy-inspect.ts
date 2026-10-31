import { DatabaseSync } from 'node:sqlite';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';

export type LegacyReport = {
  source:'vutadex-cli-sqlite';schemaVersion:number;integrity:string;
  tables:Record<string,number>;
  noteTypes:Record<string,number>;
  reviewEvents:{reviews:number;undos:number};
  warnings:string[];
  migrationReady:false;
};
const TABLES=['decks','cards','notes','generated_cards','card_schedules','review_events','study_sessions','study_session_items'] as const;
function count(db:DatabaseSync,table:string):number{
  // Table names are taken only from the constant allowlist above, never from user input.
  return Number((db.prepare('SELECT COUNT(*) AS count FROM '+table).get() as {count:number|bigint}).count);
}
/** Read-only inventory. Intentionally does NOT copy, link, change or upload data. */
export function inspectLegacyDb(file:string):LegacyReport{
  const path=resolve(file);
  const stat=statSync(path);
  if(!stat.isFile())throw new Error('Expected a regular SQLite file');
  const db=new DatabaseSync(path,{readOnly:true});
  try{
    db.exec('PRAGMA query_only=ON');
    const version=Number((db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version);
    if(version<1||version>5)throw new Error('Unsupported CLI schema version: '+version);
    const present=new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[]).map(row=>row.name));
    const tables:Record<string,number>={};
    for(const table of TABLES)tables[table]=present.has(table)?count(db,table):0;
    const noteTypes:Record<string,number>={};
    if(present.has('notes')){
      const kinds=db.prepare('SELECT note_type AS type,COUNT(*) AS count FROM notes GROUP BY note_type').all() as {type:string;count:number|bigint}[];
      for(const row of kinds)noteTypes[row.type]=Number(row.count);
    }
    const events=present.has('review_events')?db.prepare('SELECT event_type AS type,COUNT(*) AS count FROM review_events GROUP BY event_type').all() as {type:string;count:number|bigint}[]:[];
    const totals=new Map(events.map(r=>[r.type,Number(r.count)]));
    const checked=db.prepare('PRAGMA quick_check(1)').get() as {quick_check:string}|undefined;
    const warnings:string[]=[
      'Read-only inventory: no email identity, web account linking or migration performed.',
      'CLI SQLite IDs and FSRS states must not be attached to a web account without explicit ownership verification.',
      'Content-only .deck import intentionally does not transfer review history.'
    ];
    if(version<5)warnings.push('Source CLI migration is older than current schema v5.');
    if(Object.keys(noteTypes).some(t=>!['basic','reverse','cloze'].includes(t)))
      warnings.push('Advanced CLI note types need explicit supported web template mappings.');
    if(tables.card_schedules>0||tables.review_events>0)
      warnings.push('Existing scheduling/history requires reviewed FSRS-compatible migration and rollback.');
    return {source:'vutadex-cli-sqlite',schemaVersion:version,integrity:checked?.quick_check||'unknown',
      tables,noteTypes,reviewEvents:{reviews:totals.get('review')||0,undos:totals.get('undo')||0},warnings,migrationReady:false};
  }finally{db.close();}
}
// Explicit opt-in command line only; importing this module in tests never runs the CLI.
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename)){
  const path=process.argv[2];
  if(!path){console.error('Usage: node --experimental-strip-types apps/web/scripts/legacy-inspect.ts /path/to/vutadex.db');process.exitCode=2;}
  else{
    try{console.log(JSON.stringify(inspectLegacyDb(path),null,2));}
    catch(error){console.error(error instanceof Error?error.message:'Inspection failed');process.exitCode=1;}
  }
}
