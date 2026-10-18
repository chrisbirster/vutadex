import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getDataHome } from '../utils/paths.ts';

export class MediaError extends Error {}
const MAX_IMAGE_BYTES=20*1024*1024;
const PREFIX='deez-media://sha256:';
const keyPattern=/^deez-media:\/\/sha256:([0-9a-f]{64})$/;
function storageDir():string {return path.join(getDataHome(),'vutadex','media');}

function fileType(buffer:Buffer):string {
  if(buffer.length>=8&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(buffer.length>=3&&buffer[0]===255&&buffer[1]===216&&buffer[2]===255)return 'image/jpeg';
  if(buffer.length>=12&&buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP')return 'image/webp';
  if(buffer.length>=6&&['GIF87a','GIF89a'].includes(buffer.toString('ascii',0,6)))return 'image/gif';
  throw new MediaError('Only PNG, JPEG, WebP and GIF images are supported.');
}
export function importImage(filename:string):{reference:string;bytes:number;mime:string;path:string}{
  const metadata=fs.lstatSync(filename);
  if(!metadata.isFile()||metadata.size<=0||metadata.size>MAX_IMAGE_BYTES)
    throw new MediaError('Image must be a regular file between 1 byte and 20 MiB.');
  const bytes=fs.readFileSync(filename);
  if(bytes.length!==metadata.size)throw new MediaError('Image changed during import.');
  const mime=fileType(bytes);
  const hash=createHash('sha256').update(bytes).digest('hex');
  const dir=storageDir();
  fs.mkdirSync(dir,{recursive:true});
  const target=path.join(dir,hash);
  try{
    fs.writeFileSync(target,bytes,{flag:'wx',mode:0o600});
  }catch(error){
    if(!(error instanceof Error&&'code' in error&&error.code==='EEXIST'))throw error;
    const old=fs.readFileSync(target);
    if(createHash('sha256').update(old).digest('hex')!==hash)
      throw new MediaError('Existing media file checksum mismatch.');
  }
  return {reference:PREFIX+hash,bytes:bytes.length,mime,path:target};
}
export function locateImage(reference:string):{path:string;bytes:number;mime:string}{
  const hash=keyPattern.exec(reference)?.[1];
  if(!hash)throw new MediaError('Invalid content-addressed media reference.');
  const p=path.join(storageDir(),hash);
  if(!fs.existsSync(p))throw new MediaError('Image is not available in the local media store.');
  const bytes=fs.readFileSync(p);
  if(createHash('sha256').update(bytes).digest('hex')!==hash)
    throw new MediaError('Media content checksum mismatch.');
  return {path:p,bytes:bytes.length,mime:fileType(bytes)};
}
