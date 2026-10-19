import type { Choice, NoteType } from './note.ts';

export type Interaction = {
  kind: NoteType | 'legacy';
  answer?: string;
  choices?: Choice[];
  correctIds?: string[];
};
