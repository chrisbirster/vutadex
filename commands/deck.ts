import { getDatabase } from '../database/index.ts';
import { DeckError } from '../services/decks.ts';
import { showUsageInformation } from './deck/utils.ts';
import cmds from './deck/index.ts';

export async function runDeckCommand(subcommand: string | undefined, args: string[]): Promise<number> {
  if (!subcommand) return showUsageInformation();
  try {
    const db = getDatabase();
    try {
      switch (subcommand) {
        case 'delete':
          return await cmds.runDeckSubcommandDelete(db, args);
        case 'list':
          return cmds.runDeckSubcommandList(db, args);
        case 'create':
          return cmds.runDeckSubcommandCreate(db, args);
        case 'show':
          return cmds.runDeckSubcommandShow(db, args);
        case 'rename':
          return cmds.runDeckSubcommandRename(db, args);
        case 'describe':
          return cmds.runDeckSubcommandDescribe(db, args);
        default:
          return showUsageInformation();
      }
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof DeckError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}
