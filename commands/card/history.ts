import { DatabaseSync } from 'node:sqlite';
import { reviewHistory } from '../../services/reviews.ts';
import { showUsageInformation, parseCardId } from './utils.ts';

const RATING_NAMES = ['', 'Again', 'Hard', 'Good', 'Easy'];

export function runCardSubcommandHistory(db: DatabaseSync, args: string[]): number {
  if (args.length !== 1) return showUsageInformation();
  console.table(reviewHistory(db, parseCardId(args[0])).map(event => ({
    id: event.id,
    kind: event.event_type,
    rating: event.rating === null ? '-' : RATING_NAMES[event.rating],
    at: event.occurred_at,
    elapsed_days: event.elapsed_days,
    reverted_review_id: event.undone_review_id
  })));
  return 0;
}
