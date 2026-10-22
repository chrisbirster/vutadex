import { getDatabase } from '../database/index.ts';
import { DeckError } from '../services/decks.ts';
import { DeckFileError } from '../services/deck-file.ts';
import { showUsageInformation } from './deck/utils.ts';
import deckSubcommands from './deck/index.ts';

export async function runDeckCommand(subcommand: string | undefined, args: string[]): Promise<number> {
  if (!subcommand) return showUsageInformation();
  try {
    const db = getDatabase();
    try {
      switch (subcommand) {
        case 'list':
          return deckSubcommands.runDeckSubcommandList(db, args);
        case 'create':
          return deckSubcommands.runDeckSubcommandCreate(db, args);
        case 'import':
          return deckSubcommands.runDeckSubcommandImport(db, args);
        case 'export':
          return deckSubcommands.runDeckSubcommandExport(db, args);
        case 'show':
          return deckSubcommands.runDeckSubcommandShow(db, args);
        case 'rename':
          return deckSubcommands.runDeckSubcommandRename(db, args);
        case 'describe':
          return deckSubcommands.runDeckSubcommandDescribe(db, args);
        case 'delete':
          return await deckSubcommands.runDeckSubcommandDelete(db, args);
        default:
          console.error(`Unknown deck subcommand "${subcommand}".`);
          return showUsageInformation();
      }
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof DeckError || error instanceof DeckFileError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}
