import { DatabaseSync } from 'node:sqlite';
import { generatedCards, getNote } from '../../services/notes.ts';
import { NOTE_FIELDS } from '../../services/note-types.ts';
import { showUsageInformation, parseNoteId } from './utils.ts';
import { parseCommandArgs } from '../utils.ts';

export function runNoteSubcommandShow(db: DatabaseSync, args: string[]): number {
  const parsed = parseCommandArgs(args, [], 1, 1);
  if (!parsed) return showUsageInformation();
  const note = getNote(db, parseNoteId(parsed.positionals[0]));
  console.log(`Note ${note.id} (${note.type})`);
  console.table(NOTE_FIELDS[note.type].map((name, i) => ({ field: name, value: note.fields[i] })));
  console.table(generatedCards(db, note.id));
  return 0;
}
