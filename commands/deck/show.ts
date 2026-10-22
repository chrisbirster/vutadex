import type { DatabaseSync } from 'node:sqlite';
import { getDeck } from '../../services/decks.ts';
import { parseCommandArgs } from '../utils.ts';
import { showUsageInformation, parseDeckId } from './utils.ts';

export function runDeckSubcommandShow(db: DatabaseSync, args: string[]): number {
  const parsedArgs = parseCommandArgs(args, [], 1, 1);
  if (!parsedArgs) return showUsageInformation();
  console.table(getDeck(db, parseDeckId(parsedArgs.positionals[0])));
  return 0;
}
