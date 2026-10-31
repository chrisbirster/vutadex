import {createHash} from 'node:crypto';
export type ValidatedMedia={sha256:string;mime:'image/png'|'image/jpeg'|'image/webp';bytes:Buffer;width:number;height:number};
export class MediaError extends Error {}
export const MAX_IMAGE_BYTES=2*1024*1024;
function dimensionsJpeg(bytes:Buffer):[number,number]{
  if(bytes.length<8||bytes.at(-2)!==0xff||bytes.at(-1)!==0xd9)throw new MediaError('Malformed JPEG');
  let i=2;
  while(i+8<bytes.length){
    if(bytes[i]!==0xff)throw new MediaError('Malformed JPEG marker');
    while(bytes[i]===0xff)i++;
    const marker=bytes[i++]!;
    if(marker===0xd9)break;
    if(marker===0xda)break;
    if(marker>=0xd0&&marker<=0xd7)continue;
    const length=bytes.readUInt16BE(i);
    if(length<2||i+length>bytes.length)throw new MediaError('Malformed JPEG segment');
    if([0xc0,0xc1,0xc2,0xc3].includes(marker))return [bytes.readUInt16BE(i+5),bytes.readUInt16BE(i+3)];
    i+=length;
  }
  throw new MediaError('Missing JPEG dimensions');
}
export function inspectImage(bytes:Buffer):ValidatedMedia{
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>MAX_IMAGE_BYTES)
    throw new MediaError('Image must be 1 byte to 2 MiB');
  let mime:ValidatedMedia['mime'],width=0,height=0;
  if(bytes.length>=33&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){
    if(bytes.toString('ascii',12,16)!=='IHDR'||bytes.readUInt32BE(8)!==13||!bytes.includes(Buffer.from('IEND')))
      throw new MediaError('Malformed PNG');
    mime='image/png';width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);
  }else if(bytes.length>8&&bytes[0]===0xff&&bytes[1]===0xd8){
    mime='image/jpeg';[width,height]=dimensionsJpeg(bytes);
  }else if(bytes.length>=30&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'){
    if(bytes.readUInt32LE(4)!==bytes.length-8)throw new MediaError('Malformed WebP length');
    mime='image/webp';
    const variant=bytes.toString('ascii',12,16);
    if(variant==='VP8X'){width=1+bytes.readUIntLE(24,3);height=1+bytes.readUIntLE(27,3);}
    else if(variant==='VP8L'){const bits=bytes.readUInt32LE(21);width=(bits&0x3fff)+1;height=((bits>>14)&0x3fff)+1;}
    else throw new MediaError('Unsupported WebP codec');
  }else throw new MediaError('Only PNG, JPEG and WebP images are accepted (no SVG/HTML)');
  if(width<1||height<1||width>4096||height>4096||width*height>12_000_000)
    throw new MediaError('Image dimensions exceed safety limits');
  return {sha256:createHash('sha256').update(bytes).digest('hex'),mime,bytes,width,height};
}
export function parseBase64Media(value:unknown):ValidatedMedia{
  if(typeof value!=='string'||value.length>Math.ceil(MAX_IMAGE_BYTES/3)*4+8||!(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)))
    throw new MediaError('Expected canonical base64 image under 2 MiB');
  const bytes=Buffer.from(value,'base64');
  if(bytes.toString('base64')!==value)throw new MediaError('Noncanonical base64');
  return inspectImage(bytes);
}
export function refHash(ref:string):string|null{
  const match=/^deez-media:\/\/sha256:([a-f0-9]{64})$/.exec(ref);
  return match?match[1]!:null;
}
