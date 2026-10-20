import type { DatabaseSync } from 'node:sqlite';
import { loadQueryByFilename, queryAll, queryOne } from '../database/sql.ts';
import { getDeck } from './decks.ts';
import type { StudyProgress } from '../models/progress.ts';

type ActiveCard = { id: number; due_at: string | null; review_count: number | null };
type RatingRow = { rating: number; occurred_at: string };
type SessionCount = { completed: number };

const CARDS_SQL = loadQueryByFilename('progress/cards.sql');
const REVIEWS_SQL = loadQueryByFilename('progress/reviews.sql');
const SESSIONS_SQL = loadQueryByFilename('progress/sessions.sql');
const DAY_MS = 86_400_000;

/** Read-only snapshot of active cards, current FSRS due dates and non-undone review activity.
 * Days are UTC calendar dates, not a simulation of future study or scheduling decisions.
 * Globally scoped sessions are only counted in global statistics.
 */
export function getStudyProgress(
  db: DatabaseSync, deckId?: number, now = new Date(), days = 7
): StudyProgress {
  if (!Number.isFinite(now.getTime())) throw new RangeError('Invalid progress date.');
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new RangeError('Forecast days must be between 1 and 90.');
  }
  if (deckId !== undefined) getDeck(db, deckId);

  const asOf = now.toISOString();
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const forecast = Array.from({ length: days }, (_, offset) => ({
    date: new Date(todayStart + offset * DAY_MS).toISOString().slice(0, 10),
    scheduled: 0
  }));
  const cards = queryAll<ActiveCard>(db, CARDS_SQL, deckId ?? null, deckId ?? null);
  let newCards = 0;
  let dueNow = 0;
  let overdueBeforeToday = 0;
  for (const card of cards) {
    if (card.due_at === null) {
      newCards++;
      continue;
    }
    const due = Date.parse(card.due_at);
    if (!Number.isFinite(due)) throw new Error('Invalid saved FSRS due date for card ' + card.id + '.');
    if (due <= now.getTime()) dueNow++;
    const dayIndex = Math.floor((due - todayStart) / DAY_MS);
    if (dayIndex < 0) overdueBeforeToday++;
    else if (dayIndex < days) forecast[dayIndex]!.scheduled++;
  }

  const weekStart = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const events = queryAll<RatingRow>(
    db, REVIEWS_SQL, deckId ?? null, deckId ?? null, weekStart, asOf
  );
  const ratingsLast7Days = { again: 0, hard: 0, good: 0, easy: 0 };
  for (const event of events) {
    switch (event.rating) {
      case 1: ratingsLast7Days.again++; break;
      case 2: ratingsLast7Days.hard++; break;
      case 3: ratingsLast7Days.good++; break;
      case 4: ratingsLast7Days.easy++; break;
    }
  }
  const sessions = queryOne<SessionCount>(db, SESSIONS_SQL, deckId ?? null, deckId ?? null);
  return {
    asOf, timezone: 'UTC', deckId: deckId ?? null,
    totalCards: cards.length, newCards, reviewedCards: cards.length - newCards,
    dueNow, overdueBeforeToday, forecast, reviewsLast7Days: events.length,
    ratingsLast7Days, completedSessions: sessions?.completed ?? 0
  };
}
