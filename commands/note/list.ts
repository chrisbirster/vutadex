import { DatabaseSync } from 'node:sqlite';
import { generatedCards, listNotes } from '../../services/notes.ts';
import { parseDeckId } from '../deck/utils.ts';
import { showUsageInformation } from './utils.ts';

export function runNoteSubcommandList(db: DatabaseSync, args: string[]): number {
  if (args.length !== 1) return showUsageInformation();
  console.table(listNotes(db, parseDeckId(args[0])).map(note => ({
    id: note.id,
    type: note.type,
    first: note.fields[0],
    cards: generatedCards(db, note.id).filter(card => !card.retired).length
  })));
  return 0;
}
