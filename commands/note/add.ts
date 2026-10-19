import { DatabaseSync } from 'node:sqlite';
import { createNote } from '../../services/notes.ts';
import { parseNoteType } from '../../services/note-types.ts';
import { parseDeckId } from '../deck/utils.ts';
import { showUsageInformation } from './utils.ts';

export function runNoteSubcommandAdd(db: DatabaseSync, args: string[]): number {
  if (args.length < 3) return showUsageInformation();
  const deckId = parseDeckId(args[0]);
  const type = parseNoteType(args[1]!);
  const created = createNote(db, deckId, type, args.slice(2));
  console.log(`Created ${type} note ${created.note.id} with cards: ${created.cardIds.join(', ')}`);
  return 0;
}
