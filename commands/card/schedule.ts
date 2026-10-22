import { DatabaseSync } from 'node:sqlite';
import { getSchedule } from '../../services/reviews.ts';
import { showUsageInformation, parseCardId } from './utils.ts';
import { parseCommandArgs } from '../utils.ts';

export function runCardSubcommandSchedule(db: DatabaseSync, args: string[]): number {
  const parsed = parseCommandArgs(args, [], 1, 1);
  if (!parsed) return showUsageInformation();
  console.table(getSchedule(db, parseCardId(parsed.positionals[0])) ?? { status: 'new', due: 'now' });
  return 0;
}
