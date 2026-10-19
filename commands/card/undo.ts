import { DatabaseSync } from 'node:sqlite';
import { undoReview } from '../../services/reviews.ts';
import { showUsageInformation, parseCardId } from './utils.ts';

export function runCardSubcommandUndo(db: DatabaseSync, args: string[]): number {
  if (args.length !== 1) return showUsageInformation();
  const restored = undoReview(db, parseCardId(args[0]));
  console.log(restored ? `Undid latest review. Next due ${restored.dueAt}.` : 'Undid first review. Card is new.');
  return 0;
}
