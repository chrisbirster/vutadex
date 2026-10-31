/**
 * Content-only note and portable deck rules for the web app.
 * No SQLite IDs, schedules, review events or private account identifiers cross the wire.
 */
export type NoteKind = 'basic'|'reverse'|'cloze';
export type NotePayload = {type:NoteKind;front:string;back:string;tags:string};
export type Variant = {name:string;front:string;back:string};
export type ImportedDeck = {name:string;notes:NotePayload[]};
export class ContentError extends Error {}
const limit=6000;
function text(value:unknown,name:string,optional=false,max=limit):string {
  if(typeof value!=='string'||value.length>max||value.includes('\0')||(!optional&&!value.trim()))
    throw new ContentError('Invalid '+name);
  return value.trim();
}
export function validateNote(value:unknown):NotePayload {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new ContentError('Invalid note');
  const input=value as Record<string,unknown>;
  if(!['basic','reverse','cloze'].includes(String(input.type)))throw new ContentError('Unsupported note type');
  const type=input.type as NoteKind,front=text(input.front,'front'),back=text(input.back,'back',type==='cloze');
  const tags=text(input.tags??'','tags',true,300);
  const note={type,front,back,tags};
  generateVariants(note);
  return note;
}
export function generateVariants(note:NotePayload):Variant[] {
  if(note.type==='basic')return [{name:'front',front:note.front,back:note.back}];
  if(note.type==='reverse')return [
    {name:'front',front:note.front,back:note.back},
    {name:'reverse',front:note.back,back:note.front}
  ];
  const regex=/\{\{c([1-9][0-9]*)::([^{}]+)\}\}/g;
  const matches=[...note.front.matchAll(regex)];
  const markerCount=[...note.front.matchAll(/\{\{c/g)].length;
  if(!matches.length || markerCount!==matches.length)throw new ContentError('Use valid {{c1::answer}} markers');
  const answer=note.front.replace(regex,(_match,_index:string,value:string)=>value);
  const variants=[...new Set(matches.map(m=>m[1]!))];
  if(variants.length>100)throw new ContentError('Too many cloze variants');
  return variants.map(index=>({
    name:'cloze:'+index,
    front:note.front.replace(regex,(_match,n:string,value:string)=>n===index?'[...]':value),
    back:answer+(note.back?'\n'+note.back:'')
  }));
}
function exact(value:unknown,keys:string[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new ContentError('Expected JSON object');
  const obj=value as Record<string,unknown>;
  if(Object.keys(obj).some(k=>!keys.includes(k))||keys.some(k=>!(k in obj)))throw new ContentError('Unexpected fields in portable deck');
  return obj;
}
function parseJson(line:string):unknown{try{return JSON.parse(line) as unknown;}catch{throw new ContentError('Malformed portable deck JSON');}}
function tagValue(raw:unknown):string {
  if(typeof raw!=='string')throw new ContentError('Invalid tags_json');
  let value:unknown;
  try{value=JSON.parse(raw) as unknown;}catch{throw new ContentError('Invalid tags_json');}
  if(!Array.isArray(value)||value.some(tag=>typeof tag!=='string'||tag.length>100))throw new ContentError('Invalid tags_json');
  const joined=(value as string[]).join(',');
  return text(joined,'tags',true,300);
}
export function parseDeckFile(content:string):ImportedDeck {
  if(typeof content!=='string'||content.length>4*1024*1024)throw new ContentError('Portable deck exceeds 4 MiB');
  const lines=content.replace(/^\uFEFF/,'').split(/\r?\n/).filter(s=>s.trim());
  if(!lines.length||lines.length>5001)throw new ContentError('Portable deck must contain a header and at most 5000 notes');
  const header=exact(parseJson(lines[0]!),['kind','format','version','name']);
  if(header.kind!=='deck'||header.format!=='plandalf.deck'||header.version!==2)throw new ContentError('Expected plandalf.deck version 2');
  const name=text(header.name,'deck name',false,120);
  const notes:NotePayload[]=[];
  for(let i=1;i<lines.length;i++){
    const record=exact(parseJson(lines[i]!),['kind','note_type','fields','tags_json']);
    if(record.kind!=='note'||!Array.isArray(record.fields)||record.fields.length!==2)throw new ContentError('Unsupported note record');
    notes.push(validateNote({type:record.note_type,front:record.fields[0],back:record.fields[1],tags:tagValue(record.tags_json)}));
  }
  return {name,notes};
}
export function serializeDeckFile(deck:ImportedDeck):string{
  return [{kind:'deck',format:'plandalf.deck',version:2,name:deck.name},
    ...deck.notes.map(n=>({kind:'note',note_type:n.type,fields:[n.front,n.back],tags_json:JSON.stringify(n.tags?n.tags.split(',').map(x=>x.trim()).filter(Boolean):[])}))]
    .map(x=>JSON.stringify(x)).join('\n')+'\n';
}
function parseCsvRows(source:string):string[][]{
  if(source.length>4*1024*1024)throw new ContentError('CSV exceeds 4 MiB');
  const rows:string[][]=[];let row:string[]=[],field='',quoted=false,closed=false;
  for(let i=0;i<source.length;i++){
    const c=source[i]!;
    if(quoted){if(c==='"' && source[i+1]==='"'){field+='"';i++;}else if(c==='"'){quoted=false;closed=true;}else field+=c;continue;}
    if(c==='"'&&!field&&!closed){quoted=true;continue;}
    if(c===','){row.push(field);field='';closed=false;continue;}
    if(c==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';closed=false;continue;}
    if(closed&&!/\s/.test(c))throw new ContentError('Unexpected character after CSV quote');
    if(c!=='\r'||source[i+1]!=='\n')field+=c;
  }
  if(quoted)throw new ContentError('Unclosed CSV quote');
  if(field||row.length){row.push(field);rows.push(row);}
  if(rows.length>5001)throw new ContentError('Too many CSV rows');
  return rows;
}
export function parseCsv(content:string,deckName:string):ImportedDeck{
  const rows=parseCsvRows(content.replace(/^\uFEFF/,''));
  if(!rows.length)throw new ContentError('Empty CSV');
  const header=rows.shift()!.map(x=>x.trim().toLowerCase());
  if(header.length<2||header[0]!=='front'||header[1]!=='back'||header.some((h,i)=>i>1&&h!=='tags'))
    throw new ContentError('CSV headers must be front,back[,tags]');
  const notes=rows.filter(row=>row.some(s=>s.trim())).map(row=>{
    if(row.length!==header.length)throw new ContentError('Invalid CSV column count');
    return validateNote({type:'basic',front:row[0],back:row[1],tags:row[2]||''});
  });
  return {name:text(deckName,'deck name',false,120),notes};
}
