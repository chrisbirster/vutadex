import { DatabaseSync } from 'node:sqlite';
import { getCard } from '../../services/cards.ts';
import { showUsageInformation, parseCardId } from './utils.ts';

export function runCardSubcommandShow(db: DatabaseSync, args: string[]): number {
  if (args.length !== 1) return showUsageInformation();
  console.table(getCard(db, parseCardId(args[0])));
  return 0;
}
