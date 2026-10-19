import { DatabaseSync } from 'node:sqlite';
import { reviewCard } from '../../services/reviews.ts';
import type { Rating } from '../../fsrs/algorithm.ts';
import { showUsageInformation, parseCardId } from './utils.ts';

const RATINGS: Record<string, Rating> = { again: 1, hard: 2, good: 3, easy: 4 };

export function runCardSubcommandReview(db: DatabaseSync, args: string[]): number {
  if (args.length !== 2) return showUsageInformation();
  const cardId = parseCardId(args[0]);
  const rating = RATINGS[args[1]!.toLowerCase()];
  if (!rating) return showUsageInformation();
  const result = reviewCard(db, cardId, rating);
  console.log(`Card ${cardId} reviewed. Next due ${result.dueAt}.`);
  return 0;
}
