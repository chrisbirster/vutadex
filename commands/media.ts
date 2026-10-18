import { importImage,locateImage,MediaError } from '../services/media.ts';

export function runMediaCommand(args:string[]):number {
 try{
  const [sub,value]=args;
  if(args.length!==2||!value||!['add','inspect'].includes(sub??'')){
    console.error('Usage: media add <image-path> | media inspect <deez-media-reference>');
    return 1;
  }
  if(sub==='add'){
    const result=importImage(value);
    console.log('Stored '+result.mime+' ('+result.bytes+' bytes)');
    console.log(result.reference);
  }else{
    const result=locateImage(value);
    console.log('Stored image: '+result.mime+' ('+result.bytes+' bytes)');
    console.log(result.path);
  }
  return 0;
 }catch(error){
  if(error instanceof MediaError||error instanceof Error){
    console.error(error.message);return 1;
  }
  throw error;
 }
}
