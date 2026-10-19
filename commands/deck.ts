import { getDatabase } from '../database/index.ts';
import { DeckError } from '../services/decks.ts';
import { showUsageInformation } from './deck/utils.ts';
import cmds from './deck/index.ts';

export async function runDeckCommand(subcommand: string | undefined, args: string[]): Promise<number> {
  if (!subcommand) return showUsageInformation();
  try {
    if (subcommand === 'delete') {
      cmds.runDeckSubcommandDelete(db, args);
    }
    const db = getDatabase();
    try {
      switch (subcommand) {
        case 'delete':
          cmds.runDeckSubcommandDelete(db, args);
        case 'list':
          cmds.runDeckSubcommandList(db, args)
        case 'create': {
          cmds.runDeckSubcommandCreate(db, args);
        }
        case 'show': {
          cmds.runDeckSubcommandShow(db, args);
        }
        case 'rename': {
          cmds.runDeckSubcommandRename(db, args);
        }
        case 'describe': {
          cmds.runDeckSubcommandDescribe(db, args)
        }
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
