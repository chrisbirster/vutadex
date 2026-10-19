import { DatabaseSync } from 'node:sqlite';
import { listDecks } from '../../services/decks.ts';
import { showUsageInformation } from './utils.ts';


export function runDeckSubcommandList(db: DatabaseSync, args: string[]): number {
  if (args.length) return showUsageInformation();
  console.table(listDecks(db));
  return 0;
}
