import { DatabaseSync } from 'node:sqlite';
import { undoReview } from '../../services/reviews.ts';
import { showUsageInformation, parseCardId } from './utils.ts';
import { parseCommandArgs } from '../utils.ts';

export function runCardSubcommandUndo(db: DatabaseSync, args: string[]): number {
  const parsed = parseCommandArgs(args, [], 1, 1);
  if (!parsed) return showUsageInformation();
  const restored = undoReview(db, parseCardId(parsed.positionals[0]));
  console.log(restored ? `Undid latest review. Next due ${restored.dueAt}.` : 'Undid first review. Card is new.');
  return 0;
}
