import type { DatabaseSync } from 'node:sqlite';
import { noteForCard } from './notes.ts';
import { parseChoices,parseSelection } from './note-types.ts';
import { POSITIVE_INTEGER_PATTERN } from '../constants.ts';
import type { Interaction } from '../models/interaction.ts';
import type { Choice } from '../models/note.ts';

function normalize(text:string):string {
  return text.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
}
export function interactionForCard(db:DatabaseSync,cardId:number):Interaction {
  const note=noteForCard(db,cardId);
  if(!note)return {kind:'legacy'};
  const fields=note.fields;
  if(note.type==='type-answer')return {kind:note.type,answer:fields[1]};
  if(note.type==='multiple-choice'||note.type==='multiple-select'){
    const choices=parseChoices(fields[1]!);
    const correctIds=note.type==='multiple-choice'?[fields[2]!]:parseSelection(fields[2]!,choices);
    return {kind:note.type,choices,correctIds};
  }
  if(note.type==='ordering'){
    const correct=parseChoices(fields[1]!);
    const choices=correct.length===2?[...correct].reverse():[...correct.slice(1),correct[0]!];
    return {kind:note.type,choices,correctIds:correct.map(c=>c.id)};
  }
  return {kind:note.type};
}
function enteredIds(text:string, choices:readonly Choice[]):string[]{
  return text.split(',').map(s=>s.trim()).filter(Boolean).map(entry=>{
    if(POSITIVE_INTEGER_PATTERN.test(entry)){
      const index=Number(entry)-1;
      return choices[index]?.id??entry;
    }
    return entry;
  });
}
export function evaluateAnswer(interaction:Interaction,text:string):
  {correct:boolean;expected:string} {
  if(interaction.kind==='type-answer'){
    const expected=interaction.answer??'';
    return {correct:normalize(text)===normalize(expected),expected};
  }
  if(!interaction.choices||!interaction.correctIds)
    throw new Error('This note type does not have a structured answer interaction.');
  const ids=enteredIds(text,interaction.choices);
  const required=interaction.correctIds;
  const correct=interaction.kind==='ordering'
    ? ids.length===required.length&&ids.every((id,i)=>id===required[i])
    : ids.length===required.length&&new Set(ids).size===ids.length &&
      ids.every(id=>required.includes(id));
  const label=required.map(id=>interaction.choices!.find(c=>c.id===id)?.text??id).join(', ');
  return {correct,expected:label};
}
export function needsAnswerInput(interaction:Interaction):boolean {
  return ['type-answer','multiple-choice','multiple-select','ordering'].includes(interaction.kind);
}
export function answerPrompt(interaction:Interaction):string {
  switch(interaction.kind){
    case 'type-answer':return 'Type your answer (or /skip, /quit): ';
    case 'multiple-choice':return 'Choose one option number or ID (or /skip, /quit): ';
    case 'multiple-select':return 'Choose option numbers or IDs separated by commas (or /skip, /quit): ';
    case 'ordering':return 'Enter the option numbers or IDs in correct order, comma-separated (or /skip, /quit): ';
    default:return 'Answer: ';
  }
}
