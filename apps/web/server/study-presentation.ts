import {parseMasks} from '../../../services/note-types.ts';
import {refHash} from './media.ts';
export type StudyPresentation=
  | {kind:'text'}
  | {kind:'type-answer'}
  | {kind:'image-occlusion';imageHash:string;prompt:string;mask:{id:number;x:number;y:number;width:number;height:number};otherMasks:{id:number;x:number;y:number;width:number;height:number}[]};
export function studyPresentation(type:string,fieldsJson:string|null,variant:string):StudyPresentation{
  if(type==='type-answer')return {kind:'type-answer'};
  if(type!=='image-occlusion')return {kind:'text'};
  if(!fieldsJson)throw new Error('Image card has no fields');
  const fields=JSON.parse(fieldsJson) as unknown;
  if(!Array.isArray(fields)||fields.length!==3)throw new Error('Image card fields are invalid');
  const hash=refHash(fields[0] as string);
  if(!hash)throw new Error('Image card has no valid reference');
  const masks=parseMasks(fields[1] as string);
  const id=Number(/^occlusion:([1-9][0-9]*)$/.exec(variant)?.[1]);
  const target=masks.find(mask=>mask.id===id);
  if(!target)throw new Error('Image card mask is missing');
  const {answer,prompt,...rect}=target;
  return {kind:'image-occlusion',imageHash:hash,prompt:prompt||'Identify the masked region.',
    mask:rect,otherMasks:masks.filter(m=>m.id!==id).map(({answer:_,prompt:__,...rest})=>rest)};
}
