import { DatabaseSync } from 'node:sqlite';
import { getDeck } from '../../services/decks.ts';
import { showUsageInformation, parseDeckId } from './utils.ts';
import { parseCommandArgs } from '../utils.ts';

export function runDeckSubcommandShow(db: DatabaseSync, args: string[]): number {
  const parsed = parseCommandArgs(args, [], 1, 1);
  if (!parsed) return showUsageInformation();
  console.table(getDeck(db, parseDeckId(parsed.positionals[0])));
  return 0;
}
