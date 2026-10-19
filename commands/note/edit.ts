import { DatabaseSync } from 'node:sqlite';
import { updateNote } from '../../services/notes.ts';
import { showUsageInformation, parseNoteId } from './utils.ts';

export function runNoteSubcommandEdit(db: DatabaseSync, args: string[]): number {
  if (args.length < 2) return showUsageInformation();
  const updated = updateNote(db, parseNoteId(args[0]), args.slice(1));
  console.log(`Updated note ${updated.note.id}; active cards: ${updated.cardIds.join(', ')}`);
  return 0;
}
