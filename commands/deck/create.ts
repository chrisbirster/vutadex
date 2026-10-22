import type { DatabaseSync } from 'node:sqlite';
import { createDeck } from '../../services/decks.ts';
import { parseCommandArgs } from '../utils.ts';
import { showUsageInformation } from './utils.ts';

export function runDeckSubcommandCreate(db: DatabaseSync, args: string[]): number {
  const parsedArgs = parseCommandArgs(args, [], 1, Infinity, ['description']);
  if (!parsedArgs) return showUsageInformation();
  const deck = createDeck(db, parsedArgs.positionals.join(' '), parsedArgs.values.description ?? null);
  console.log(`Created deck "${deck.name}" (ID: ${deck.id})`);
  return 0;
}
