import { DatabaseSync } from 'node:sqlite';
import { generatedCards, getNote } from '../../services/notes.ts';
import { NOTE_FIELDS } from '../../services/note-types.ts';
import { showUsageInformation, parseNoteId } from './utils.ts';

export function runNoteSubcommandShow(db: DatabaseSync, args: string[]): number {
  if (args.length !== 1) return showUsageInformation();
  const note = getNote(db, parseNoteId(args[0]));
  console.log(`Note ${note.id} (${note.type})`);
  console.table(NOTE_FIELDS[note.type].map((name, i) => ({ field: name, value: note.fields[i] })));
  console.table(generatedCards(db, note.id));
  return 0;
}
