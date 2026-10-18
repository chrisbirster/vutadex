/** Built-in note semantics compatible with Plandalf's logical .deck v2 fields. */
export type NoteType =
  | 'basic' | 'reverse' | 'optional-reverse' | 'cloze'
  | 'type-answer' | 'multiple-choice' | 'multiple-select'
  | 'ordering' | 'image-occlusion';
export type Draft = { key: string; front: string; back: string };
export type Choice = { id: string; text: string };
export type Mask = {
  id: number; x: number; y: number; width: number; height: number;
  answer: string; prompt?: string;
};
export class NoteError extends Error {}

export const NOTE_FIELDS: Readonly<Record<NoteType, readonly string[]>> = {
  basic: ['Front','Back'],
  reverse: ['Front','Back'],
  'optional-reverse': ['Front','Back','Add Reverse'],
  cloze: ['Text','Extra'],
  'type-answer': ['Front','Back'],
  'multiple-choice': ['Prompt','Choices','Correct','Explanation'],
  'multiple-select': ['Prompt','Choices','Correct','Explanation'],
  ordering: ['Prompt','Items','Explanation'],
  'image-occlusion': ['Image','Masks','Extra']
};

export function parseNoteType(value: string): NoteType {
  const names: Record<string, NoteType> = {
    basic:'basic', reverse:'reverse', 'basic-reverse':'reverse',
    'optional-reverse':'optional-reverse', cloze:'cloze',
    'type':'type-answer', 'type-answer':'type-answer',
    mcq:'multiple-choice', 'multiple-choice':'multiple-choice',
    'multi-select':'multiple-select', 'multiple-select':'multiple-select',
    order:'ordering', ordering:'ordering',
    occlusion:'image-occlusion', 'image-occlusion':'image-occlusion'
  };
  const kind = names[value];
  if (!kind) throw new NoteError('Unsupported note type: ' + value);
  return kind;
}

function nonempty(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 10000 || value.includes('\0'))
    throw new NoteError(label + ' must contain 1–10000 characters without NUL.');
  return value.trim();
}
function optional(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length > 10000 || value.includes('\0'))
    throw new NoteError(label + ' must be text of at most 10000 characters.');
  return value.trim();
}
function parseJson(value: string, label: string): unknown {
  try { return JSON.parse(value) as unknown; }
  catch { throw new NoteError(label + ' must contain valid JSON.'); }
}
export function parseChoices(value: string): Choice[] {
  const raw = parseJson(value, 'Choices');
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 100)
    throw new NoteError('Choices must be a JSON array with 2–100 elements.');
  const found = new Set<string>();
  return raw.map((x: unknown) => {
    if (!x || typeof x !== 'object' || Array.isArray(x) ||
        Object.keys(x).some(k => k !== 'id' && k !== 'text'))
      throw new NoteError('Each choice must contain only id and text.');
    const choice = x as Record<string, unknown>;
    const id = nonempty(choice.id, 'Choice ID');
    const text = nonempty(choice.text, 'Choice text');
    if (found.has(id)) throw new NoteError('Duplicate choice ID: ' + id);
    found.add(id);
    return {id,text};
  });
}
export function parseSelection(value: string, choices: readonly Choice[]): string[] {
  const raw = parseJson(value, 'Correct choices');
  if (!Array.isArray(raw) || !raw.length ||
      !raw.every((x: unknown) => typeof x === 'string'))
    throw new NoteError('Correct choices must be a nonempty JSON array of choice IDs.');
  const ids = raw as string[];
  if (ids.length !== new Set(ids).size ||
      ids.some(id => !choices.some(c => c.id === id)))
    throw new NoteError('Correct IDs must be unique and present in choices.');
  return ids;
}
export function parseMasks(value: string): Mask[] {
  const raw = parseJson(value, 'Masks');
  if (!Array.isArray(raw) || !raw.length || raw.length > 100)
    throw new NoteError('Masks must contain 1–100 JSON rectangles.');
  const seen = new Set<number>();
  return raw.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        Object.keys(item).some(k => !['id','x','y','width','height','answer','prompt'].includes(k)))
      throw new NoteError('Invalid mask object.');
    const m = item as Record<string, unknown>;
    const id = m.id as number;
    if (!Number.isSafeInteger(id) || id < 1 || seen.has(id))
      throw new NoteError('Mask IDs must be unique positive integers.');
    seen.add(id);
    for (const key of ['x','y','width','height']) {
      if (typeof m[key] !== 'number' || !Number.isFinite(m[key]))
        throw new NoteError('Invalid mask coordinate: ' + key);
    }
    const x = m.x as number, y = m.y as number;
    const width = m.width as number, height = m.height as number;
    if (x < 0 || y < 0 || width <= 0 || height <= 0 ||
        x + width > 1.0000001 || y + height > 1.0000001)
      throw new NoteError('Masks must fit in the normalized 0–1 image rectangle.');
    return {id, x, y, width, height, answer:nonempty(m.answer, 'Mask answer'),
      ...(m.prompt === undefined ? {} : {prompt:nonempty(m.prompt, 'Mask prompt')})};
  });
}
type Cloze = {ordinal: number; text: string; hint: string | null; start: number; end: number};
export function parseClozes(source: string): Cloze[] {
  const pattern = /\{\{c([1-9][0-9]*)::([^{}]*?)(?:::([^{}]*?))?\}\}/g;
  const matches: Cloze[] = [];
  for (const match of source.matchAll(pattern)) {
    const ordinal = Number(match[1]);
    if (!Number.isSafeInteger(ordinal) || ordinal > 100000)
      throw new NoteError('Cloze ordinal is out of range.');
    matches.push({ordinal, text:nonempty(match[2], 'Cloze text'),
      hint:match[3] ?? null, start:match.index, end:match.index + match[0].length});
  }
  if (!matches.length || matches.length !== [...source.matchAll(/\{\{c/g)].length)
    throw new NoteError('Cloze text must use valid {{c1::answer}} or {{c1::answer::hint}} markers.');
  return matches;
}
function renderCloze(source: string, spans: readonly Cloze[], ordinal: number | null): string {
  let output = '', cursor = 0;
  for (const span of spans) {
    output += source.slice(cursor, span.start);
    output += ordinal === span.ordinal
      ? '[' + (span.hint || '...') + ']' : span.text;
    cursor = span.end;
  }
  return output + source.slice(cursor);
}
function checkDraft(draft: Draft): Draft {
  if (!draft.front.trim() || !draft.back.trim() ||
      draft.front.length > 10000 || draft.back.length > 10000)
    throw new NoteError('Generated card front/back must each contain 1–10000 characters.');
  return draft;
}
function explain(text: string): string { return text ? '\n\n' + text : ''; }

/** Deterministic drafts; keys follow Plandalf's note:<id>:template/cloze/occlusion scheme. */
export function generateCards(noteId: number, type: NoteType, fields: readonly string[]): Draft[] {
  if (!Number.isSafeInteger(noteId) || noteId < 1) throw new NoteError('Invalid note ID.');
  const expected = NOTE_FIELDS[type];
  if (!expected || fields.length !== expected.length)
    throw new NoteError(type + ' requires fields: ' + (expected ?? []).join(', '));
  const key = (variant: string): string => 'note:' + noteId + ':' + variant;
  const template = (ord: number, front: string, back: string): Draft =>
    checkDraft({key:key('template:' + ord),front,back});
  let drafts: Draft[];
  switch(type) {
    case 'basic':
    case 'reverse':
    case 'optional-reverse':
    case 'type-answer': {
      const a = nonempty(fields[0], 'Front'), b = nonempty(fields[1], 'Back');
      drafts = [template(0,a,b)];
      if (type === 'reverse' || (type === 'optional-reverse' && optional(fields[2], 'Add Reverse')))
        drafts.push(template(1,b,a));
      break;
    }
    case 'cloze': {
      const source = nonempty(fields[0], 'Text'), extra = optional(fields[1], 'Extra');
      const spans = parseClozes(source);
      const ordinals = [...new Set(spans.map(s => s.ordinal))].sort((a,b)=>a-b);
      drafts = ordinals.map(n=>checkDraft({key:key('cloze:' + n),
        front:renderCloze(source,spans,n),
        back:renderCloze(source,spans,null) + explain(extra)}));
      break;
    }
    case 'multiple-choice':
    case 'multiple-select': {
      const prompt = nonempty(fields[0], 'Prompt'), choices = parseChoices(fields[1]!);
      const expl = optional(fields[3], 'Explanation');
      const correct = type === 'multiple-choice'
        ? [nonempty(fields[2], 'Correct choice')] : parseSelection(fields[2]!,choices);
      if (type === 'multiple-choice' && !choices.some(c=>c.id===correct[0]))
        throw new NoteError('Correct ID not found in choices.');
      const list = choices.map((c,i)=>(i+1)+'. '+c.text).join('\n');
      const answers = correct.map(id=>choices.find(c=>c.id===id)!.text).join(', ');
      drafts = [template(0,prompt+'\n'+list,'Correct: '+answers+explain(expl))];
      break;
    }
    case 'ordering': {
      const prompt = nonempty(fields[0], 'Prompt'), items = parseChoices(fields[1]!);
      const expl = optional(fields[2], 'Explanation');
      // Deterministic noncanonical display permutation (not the correct order).
      const presentation = items.length===2 ? [...items].reverse()
        : [...items.slice(1),items[0]!];
      drafts = [template(0,prompt+'\n'+presentation.map((c,i)=>(i+1)+'. '+c.text).join('\n'),
        'Correct order:\n'+items.map((c,i)=>(i+1)+'. '+c.text).join('\n')+explain(expl))];
      break;
    }
    case 'image-occlusion': {
      const image = nonempty(fields[0], 'Image'), extra = optional(fields[2], 'Extra');
      if (!/^deez-media:\/\/sha256:[0-9a-f]{64}$/.test(image))
        throw new NoteError('Image must be a deez-media://sha256:<64 lowercase hex> reference.');
      const masks = parseMasks(fields[1]!);
      drafts = masks.sort((a,b)=>a.id-b.id).map(m=>checkDraft({key:key('occlusion:'+m.id),
        front:(m.prompt ?? 'Identify the masked region.')+'\n[image: '+image+']'+
          '\n[mask '+m.id+': x='+m.x+' y='+m.y+' width='+m.width+' height='+m.height+']',
        back:m.answer+explain(extra)}));
      break;
    }
  }
  return drafts;
}
