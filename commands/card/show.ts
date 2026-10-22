import { DatabaseSync } from 'node:sqlite';
import { getCard } from '../../services/cards.ts';
import { showUsageInformation, parseCardId } from './utils.ts';
import { parseCommandArgs } from '../utils.ts';

export function runCardSubcommandShow(db: DatabaseSync, args: string[]): number {
  const parsed = parseCommandArgs(args, [], 1, 1);
  if (!parsed) return showUsageInformation();
  console.table(getCard(db, parseCardId(parsed.positionals[0])));
  return 0;
}
