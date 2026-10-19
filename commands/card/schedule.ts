import { DatabaseSync } from 'node:sqlite';
import { getSchedule } from '../../services/reviews.ts';
import { showUsageInformation, parseCardId } from './utils.ts';

export function runCardSubcommandSchedule(db: DatabaseSync, args: string[]): number {
  if (args.length !== 1) return showUsageInformation();
  console.table(getSchedule(db, parseCardId(args[0])) ?? { status: 'new', due: 'now' });
  return 0;
}
