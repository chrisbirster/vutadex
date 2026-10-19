import { DatabaseSync } from 'node:sqlite';
import { getDeck } from '../../services/decks.ts';
import { showUsageInformation, parseDeckId } from './utils.ts';

export function runDeckSubcommandShow(db: DatabaseSync, args: string[]): number {
  if (args.length !== 1) return showUsageInformation();
  console.table(getDeck(db, parseDeckId(args[0])));
  return 0;
}


