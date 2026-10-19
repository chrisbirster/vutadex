import { getDatabase } from '../database/index.ts';
import { CardError } from '../services/cards.ts';
import { DeckError } from '../services/decks.ts';
import { ReviewError } from '../services/reviews.ts';
import { showUsageInformation } from './card/utils.ts';
import cmds from './card/index.ts';

export async function runCardCommand(subcommand: string | undefined, args: string[]): Promise<number> {
  if (!subcommand) return showUsageInformation();
  try {
    const db = getDatabase();
    try {
      switch (subcommand) {
        case 'add':
          return await cmds.runCardSubcommandAdd(db, args);
        case 'list':
          return cmds.runCardSubcommandList(db, args);
        case 'search':
          return cmds.runCardSubcommandSearch(db, args);
        case 'show':
          return cmds.runCardSubcommandShow(db, args);
        case 'edit':
          return await cmds.runCardSubcommandEdit(db, args);
        case 'delete':
          return await cmds.runCardSubcommandDelete(db, args);
        case 'review':
          return cmds.runCardSubcommandReview(db, args);
        case 'undo':
          return cmds.runCardSubcommandUndo(db, args);
        case 'history':
          return cmds.runCardSubcommandHistory(db, args);
        case 'schedule':
          return cmds.runCardSubcommandSchedule(db, args);
        default:
          return showUsageInformation();
      }
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof CardError || error instanceof DeckError || error instanceof ReviewError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}
