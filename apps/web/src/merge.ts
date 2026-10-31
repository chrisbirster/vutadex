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

/** Positional fields are canonical; front/back are mirrors. */
export type FieldPath=string;
export type FieldMerge={merged:EditableNote;localChanges:FieldPath[];conflicts:FieldPath[]};
export function reconcileFieldPaths(base:EditableNote,local:EditableNote,remote:EditableNote):FieldMerge{
  const merged:EditableNote={...remote,fields:[...remote.fields]};
  const localChanges:FieldPath[]=[],conflicts:FieldPath[]=[];
  const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
  for(const path of ['type','tags'] as const){
    if(same(local[path],base[path]))continue;
    localChanges.push(path);
    if(!same(remote[path],base[path])&&!same(remote[path],local[path]))conflicts.push(path);
    else merged[path]=local[path];
  }
  const changedType=!same(base.type,local.type)||!same(base.type,remote.type);
  const length=Math.max(base.fields.length,local.fields.length,remote.fields.length);
  for(let index=0;index<length;index++){
    const path='fields['+index+']';
    const before=base.fields[index],ours=local.fields[index],theirs=remote.fields[index];
    if(same(ours,before))continue;
    localChanges.push(path);
    if(changedType||(!same(theirs,before)&&!same(ours,theirs))){
      conflicts.push(path);
      continue;
    }
    if(ours===undefined)merged.fields.splice(index,1);
    else merged.fields[index]=ours;
  }
  merged.front=merged.fields[0]||'';merged.back=merged.fields[1]||'';
  return {merged,localChanges,conflicts};
}
export function applyFieldSelections(remote:EditableNote,local:EditableNote,paths:readonly FieldPath[]):EditableNote{
  const merged:EditableNote={...remote,fields:[...remote.fields]};
  const selected=new Set(paths);
  for(const path of ['type','tags'] as const)if(selected.has(path))merged[path]=local[path];
  const indices=[...selected].filter(path=>/^fields\[(0|[1-9][0-9]*)\]$/.test(path))
    .map(path=>Number(path.slice(7,-1))).sort((a,b)=>b-a);
  for(const index of indices){
    if(local.fields[index]===undefined)merged.fields.splice(index,1);
    else merged.fields[index]=local.fields[index]!;
  }
  merged.front=merged.fields[0]||'';merged.back=merged.fields[1]||'';
  return merged;
}
