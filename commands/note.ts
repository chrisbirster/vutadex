import { getDatabase } from '../database/index.ts';
import { CardError } from '../services/cards.ts';
import { DeckError } from '../services/decks.ts';
import { NoteError } from '../services/note-types.ts';
import { showUsageInformation } from './note/utils.ts';
import cmds from './note/index.ts';

export async function runNoteCommand(subcommand: string | undefined, args: string[]): Promise<number> {
  if (!subcommand) return showUsageInformation();
  try {
    // `types` only prints a static table, so it skips opening (and migrating) the database.
    if (subcommand === 'types') return cmds.runNoteSubcommandTypes(args);
    const db = getDatabase();
    try {
      switch (subcommand) {
        case 'add':
          return cmds.runNoteSubcommandAdd(db, args);
        case 'list':
          return cmds.runNoteSubcommandList(db, args);
        case 'show':
          return cmds.runNoteSubcommandShow(db, args);
        case 'edit':
          return cmds.runNoteSubcommandEdit(db, args);
        case 'delete':
          return await cmds.runNoteSubcommandDelete(db, args);
        default:
          return showUsageInformation();
      }
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof NoteError || error instanceof CardError || error instanceof DeckError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}
