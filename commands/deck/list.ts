import type { DatabaseSync } from 'node:sqlite';
import { listDecks } from '../../services/decks.ts';
import { parseCommandArgs } from '../utils.ts';
import { showUsageInformation } from './utils.ts';

export function runDeckSubcommandList(db: DatabaseSync, args: string[]): number {
  if (!parseCommandArgs(args, [], 0, 0)) return showUsageInformation();
  console.table(listDecks(db));
  return 0;
}
