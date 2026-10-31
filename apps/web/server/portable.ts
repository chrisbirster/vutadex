import {createHash} from 'node:crypto';
import {parseBase64Media,refHash,MediaError} from './media.ts';
import {validateNote,type NotePayload} from './content.ts';

export class PortableError extends Error {}
export const PORTABLE_LIMIT=12*1024*1024;
export type PortableMedia={hash:string;mime:string;base64:string};
export type PortableBundle={
  format:'vutadex.portable';version:1;
  deck:{name:string;description:string};
  notes:{type:string;fields:string[];tags:string}[];
  media:PortableMedia[];
};
export type CheckedPortable={deck:{name:string;description:string};notes:NotePayload[];media:{hash:string;mime:string;bytes:Buffer;width:number;height:number}[];checksum:string};
export function inspectPortable(value:unknown):CheckedPortable{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new PortableError('Invalid portable bundle');
  const bundle=value as PortableBundle;
  if(bundle.format!=='vutadex.portable'||bundle.version!==1||
     !bundle.deck||!Array.isArray(bundle.notes)||!Array.isArray(bundle.media))throw new PortableError('Unsupported portable format');
  if(bundle.notes.length>5000||bundle.media.length>20)throw new PortableError('Portable bundle exceeds item limits');
  const size=Buffer.byteLength(JSON.stringify(bundle));
  if(size>PORTABLE_LIMIT)throw new PortableError('Portable bundle exceeds 12 MiB');
  const name=bundle.deck.name,description=bundle.deck.description;
  if(typeof name!=='string'||!name.trim()||name.length>120||
     typeof description!=='string'||description.length>500)throw new PortableError('Invalid deck metadata');
  const media:CheckedPortable['media']=[];
  const used=new Set<string>();
  for(const item of bundle.media){
    if(!item||typeof item.hash!=='string'||!/^[a-f0-9]{64}$/.test(item.hash)||used.has(item.hash))
      throw new PortableError('Invalid or duplicated asset hash');
    used.add(item.hash);
    let verified:ReturnType<typeof parseBase64Media>;
    try{verified=parseBase64Media(item.base64);}catch(e){
      if(e instanceof MediaError)throw new PortableError(e.message);
      throw e;
    }
    if(verified.sha256!==item.hash||verified.mime!==item.mime)
      throw new PortableError('Asset checksum or MIME mismatch');
    media.push({hash:item.hash,mime:item.mime,bytes:verified.bytes,width:verified.width,height:verified.height});
  }
  const notes:NotePayload[]=[];
  for(const item of bundle.notes){
    const note=validateNote({type:item?.type,fields:item?.fields,tags:item?.tags});
    if(note.type==='image-occlusion'){
      const hash=refHash(note.fields[0]||'');
      if(!hash||!used.has(hash))throw new PortableError('Missing referenced media asset');
    }
    notes.push(note);
  }
  // Extra unreferenced media is rejected, rather than accidentally exporting stale/private blobs.
  const referenced=new Set(notes.filter(n=>n.type==='image-occlusion').map(n=>refHash(n.fields[0]!)!));
  if(media.some(item=>!referenced.has(item.hash)))throw new PortableError('Unreferenced asset in bundle');
  return {deck:{name:name.trim(),description},notes,media,
    checksum:createHash('sha256').update(JSON.stringify(bundle)).digest('hex')};
}
export function createPortable(input:{name:string;description:string;notes:NotePayload[];media:PortableMedia[]}):PortableBundle{
  return {format:'vutadex.portable',version:1,deck:{name:input.name,description:input.description},
    notes:input.notes.map(n=>({type:n.type,fields:[...n.fields],tags:n.tags})),media:input.media};
}
