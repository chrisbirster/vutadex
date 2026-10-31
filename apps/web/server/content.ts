/** Browser-compatible content interchange, validated via the existing CLI note engine. */
import { generateCards, NOTE_FIELDS, NoteError } from '../../../services/note-types.ts';
import type { NoteType } from '../../../models/note.ts';

export type NoteKind = NoteType;
export type NotePayload={type:NoteKind;front:string;back:string;tags:string;fields:string[]};
export type Variant={name:string;front:string;back:string};
export type ImportedDeck={name:string;notes:NotePayload[]};
export class ContentError extends Error {}
const MAX_TEXT=6000;
const kindList=Object.keys(NOTE_FIELDS) as NoteType[];
export const CONTENT_NOTE_TYPES=kindList;
function plain(value:unknown,label:string,optional=false,max=MAX_TEXT):string{
  if(typeof value!=='string'||value.length>max||value.includes('\0')||(!optional&&!value.trim()))
    throw new ContentError('Invalid '+label);
  return value.trim();
}
function fieldsFor(type:NoteKind,input:Record<string,unknown>):string[]{
  const count=NOTE_FIELDS[type].length;
  if(input.fields!==undefined){
    if(!Array.isArray(input.fields)||input.fields.length!==count||!input.fields.every(v=>typeof v==='string'))
      throw new ContentError(type+' requires exactly '+count+' string fields');
    return [...input.fields] as string[];
  }
  if(count>2)throw new ContentError('Explicit fields required for '+type);
  return [plain(input.front,'front'),plain(input.back,'back',type==='cloze')];
}
export function validateNote(value:unknown):NotePayload{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new ContentError('Invalid note');
  const input=value as Record<string,unknown>;
  if(!kindList.includes(input.type as NoteKind))throw new ContentError('Unsupported note type');
  const type=input.type as NoteKind;
  const fields=fieldsFor(type,input);
  const tags=plain(input.tags??'','tags',true,300);
  const note={type,front:fields[0]||'',back:fields[1]||'',fields,tags};
  generateVariants(note);
  return note;
}
export function generateVariants(note:NotePayload):Variant[]{
  try{
    const drafts=generateCards(1,note.type,note.fields);
    return drafts.map((d,i)=>{
      const key=d.key.replace(/^note:1:/,'');
      // Preserve the already-persisted legacy variant keys so edits retain FSRS history.
      const name=key==='template:0'&&['basic','reverse','cloze','type-answer'].includes(note.type)?'front'
        :key==='template:1'&&note.type==='reverse'?'reverse':key;
      return {name,front:d.front,back:d.back};
    });
  }catch(error){
    if(error instanceof NoteError)throw new ContentError(error.message);
    throw error;
  }
}
function exact(value:unknown,keys:string[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new ContentError('Expected JSON object');
  const obj=value as Record<string,unknown>;
  if(Object.keys(obj).some(k=>!keys.includes(k))||keys.some(k=>!(k in obj)))throw new ContentError('Unexpected fields in portable deck');
  return obj;
}
function parseJson(line:string):unknown{try{return JSON.parse(line) as unknown;}catch{throw new ContentError('Malformed portable deck JSON');}}
function tagValue(raw:unknown):string{
  if(typeof raw!=='string')throw new ContentError('Invalid tags_json');
  let value:unknown;
  try{value=JSON.parse(raw) as unknown;}catch{throw new ContentError('Invalid tags_json');}
  if(!Array.isArray(value)||value.some(v=>typeof v!=='string'||v.length>100))throw new ContentError('Invalid tags_json');
  return plain((value as string[]).join(','),'tags',true,300);
}
export function parseDeckFile(content:string):ImportedDeck{
  if(typeof content!=='string'||content.length>4*1024*1024)throw new ContentError('Portable deck exceeds 4 MiB');
  const lines=content.replace(/^\uFEFF/,'').split(/\r?\n/).filter(s=>s.trim());
  if(!lines.length||lines.length>5001)throw new ContentError('Portable deck must have a header and at most 5000 notes');
  const header=exact(parseJson(lines[0]!),['kind','format','version','name']);
  if(header.kind!=='deck'||header.format!=='plandalf.deck'||header.version!==2)throw new ContentError('Expected plandalf.deck version 2');
  const name=plain(header.name,'deck name',false,120),notes:NotePayload[]=[];
  for(let i=1;i<lines.length;i++){
    const row=exact(parseJson(lines[i]!),['kind','note_type','fields','tags_json']);
    if(row.kind!=='note')throw new ContentError('Unsupported note record');
    if(row.note_type==='image-occlusion')throw new ContentError('Image-occlusion cannot be imported via content-only .deck without portable image bytes');
    notes.push(validateNote({type:row.note_type,fields:row.fields,tags:tagValue(row.tags_json)}));
  }
  return {name,notes};
}
export function serializeDeckFile(deck:ImportedDeck):string{
  return [{kind:'deck',format:'plandalf.deck',version:2,name:deck.name},
    ...deck.notes.map(n=>({kind:'note',note_type:n.type,fields:n.fields,tags_json:JSON.stringify(n.tags?n.tags.split(',').map(v=>v.trim()).filter(Boolean):[])}))]
    .map(x=>JSON.stringify(x)).join('\n')+'\n';
}
function parseCsvRows(source:string):string[][]{
  if(source.length>4*1024*1024)throw new ContentError('CSV exceeds 4 MiB');
  const rows:string[][]=[];let row:string[]=[],field='',quoted=false,closed=false;
  for(let i=0;i<source.length;i++){
    const c=source[i]!;
    if(quoted){if(c==='"'&&source[i+1]==='"'){field+='"';i++;}else if(c==='"'){quoted=false;closed=true;}else field+=c;continue;}
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
  return {name:plain(deckName,'deck name',false,120),notes};
}
