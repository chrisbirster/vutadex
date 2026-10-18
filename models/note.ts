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

export interface Note {
  id: number; deckId: number; type: NoteType;
  fields: string[]; tags: string[]; retired: boolean;
}
export interface GeneratedCard {
  cardId: number; key: string; retired: boolean;
}
