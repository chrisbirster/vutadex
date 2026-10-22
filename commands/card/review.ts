import { DatabaseSync } from 'node:sqlite';
import { reviewCard } from '../../services/reviews.ts';
import type { Rating } from '../../fsrs/algorithm.ts';
import { parseCommandArgs } from '../utils.ts';
import { showUsageInformation, parseCardId } from './utils.ts';

const RATINGS: Record<string, Rating> = { again: 1, hard: 2, good: 3, easy: 4 };

export function runCardSubcommandReview(db: DatabaseSync, args: string[]): number {
  const parsed = parseCommandArgs(args, [], 2, 2);
  if (!parsed) return showUsageInformation();
  const cardId = parseCardId(parsed.positionals[0]);
  const rating = RATINGS[parsed.positionals[1]!.toLowerCase()];
  if (!rating) return showUsageInformation();
  const result = reviewCard(db, cardId, rating);
  console.log(`Card ${cardId} reviewed. Next due ${result.dueAt}.`);
  return 0;
}
