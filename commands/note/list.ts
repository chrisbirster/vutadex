import { DatabaseSync } from 'node:sqlite';
import { generatedCards, listNotes } from '../../services/notes.ts';
import { parseDeckId } from '../deck/utils.ts';
import { showUsageInformation } from './utils.ts';
import { parseCommandArgs } from '../utils.ts';

export function runNoteSubcommandList(db: DatabaseSync, args: string[]): number {
  const parsed = parseCommandArgs(args, [], 1, 1);
  if (!parsed) return showUsageInformation();
  console.table(listNotes(db, parseDeckId(parsed.positionals[0])).map(note => ({
    id: note.id,
    type: note.type,
    first: note.fields[0],
    cards: generatedCards(db, note.id).filter(card => !card.retired).length
  })));
  return 0;
}
