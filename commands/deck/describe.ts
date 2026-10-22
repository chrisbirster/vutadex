import type { DatabaseSync } from 'node:sqlite';
import { describeDeck } from '../../services/decks.ts';
import { parseCommandArgs } from '../utils.ts';
import { showUsageInformation, parseDeckId } from './utils.ts';

export function runDeckSubcommandDescribe(db: DatabaseSync, args: string[]): number {
  const parsedArgs = parseCommandArgs(args, ['clear'], 1, Infinity);
  if (!parsedArgs) return showUsageInformation();
  const [deckIdText, ...descriptionWords] = parsedArgs.positionals;
  const isClearing = parsedArgs.flags.clear;
  if (isClearing === (descriptionWords.length > 0)) return showUsageInformation(); // exactly one of text or --clear
  const deck = describeDeck(db, parseDeckId(deckIdText), isClearing ? null : descriptionWords.join(' '));
  console.log(`Updated description for deck ${deck.id}.`);
  return 0;
}
