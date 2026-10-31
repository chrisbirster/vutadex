/** Field-level three-way merge; never silently resolve two different edits to the same field. */
export type EditableNote={type:string;front:string;back:string;fields:string[];tags:string};
export type MergeResult={merged:EditableNote;overlaps:(keyof EditableNote)[];changes:(keyof EditableNote)[]};
const KEY=['type','front','back','fields','tags'] as const;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function mergeEdits(base:EditableNote,local:EditableNote,remote:EditableNote):MergeResult{
  const merged={...remote,fields:[...remote.fields]};
  const overlaps:(keyof EditableNote)[]=[],changes:(keyof EditableNote)[]=[];
  for(const key of KEY){
    const yoursChanged=!same(local[key],base[key]),theirsChanged=!same(remote[key],base[key]);
    if(!yoursChanged)continue;
    changes.push(key);
    if(theirsChanged&&!same(remote[key],local[key])){
      overlaps.push(key);
      continue; // Remote default until the user explicitly chooses their value.
    }
    (merged as Record<string,unknown>)[key]=local[key];
  }
  return {merged,overlaps,changes};
}
export function applySelections(remote:EditableNote,local:EditableNote,choices:readonly (keyof EditableNote)[]):EditableNote{
  const result={...remote,fields:[...remote.fields]};
  for(const key of choices)(result as Record<string,unknown>)[key]=local[key];
  return result;
}
