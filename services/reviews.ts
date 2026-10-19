import type { DatabaseSync } from 'node:sqlite';
import { getCard } from './cards.ts';
import { FSRS_VERSION } from '../fsrs/parameters.ts';
import { retrievability, nextMemoryState, nextIntervalDays } from '../fsrs/algorithm.ts';
import type { Rating } from '../fsrs/algorithm.ts';
import { execute, loadQueryByFilename, queryAll, queryOne } from '../database/sql.ts';
import { TARGET_RETENTION } from '../constants.ts';
import type { DueCard, ReviewEvent, ReviewHooks, Schedule, UndoHooks } from '../models/review.ts';

const GET_SCHEDULE_SQL = loadQueryByFilename('reviews/get-schedule.sql');
const DELETE_SCHEDULE_SQL = loadQueryByFilename('reviews/delete-schedule.sql');
const UPSERT_SCHEDULE_SQL = loadQueryByFilename('reviews/upsert-schedule.sql');
const IS_RETIRED_SQL = loadQueryByFilename('reviews/is-retired.sql');
const INSERT_REVIEW_EVENT_SQL = loadQueryByFilename('reviews/insert-review-event.sql');
const REVIEW_HISTORY_SQL = loadQueryByFilename('reviews/history.sql');
const LATEST_ACTIVE_REVIEW_SQL = loadQueryByFilename('reviews/latest-active.sql');
const INSERT_UNDO_EVENT_SQL = loadQueryByFilename('reviews/insert-undo-event.sql');
const DUE_CARDS_SQL = loadQueryByFilename('reviews/due.sql');

const DAY_MS = 86400000;
export class ReviewError extends Error { }

function checkedTime(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new ReviewError('Invalid review date.');
  return now.toISOString();
}
function readSchedule(db: DatabaseSync, cardId: number): Schedule | null {
  const row = queryOne<{
    stability: number; difficulty: number; fast_stability: number;
    last_review_at: string; due_at: string; review_count: number; scheduler_version: string
  }>(
    db, GET_SCHEDULE_SQL, cardId);
  if (!row) return null;
  if (row.scheduler_version !== FSRS_VERSION) {
    throw new ReviewError('Unsupported scheduler version in saved card; migration required.');
  }
  return {
    state: { stability: row.stability, difficulty: row.difficulty, fastStability: row.fast_stability },
    lastReviewAt: row.last_review_at, dueAt: row.due_at, reviewCount: row.review_count
  };
}
export function getSchedule(db: DatabaseSync, cardId: number): Schedule | null {
  getCard(db, cardId);
  return readSchedule(db, cardId);
}
function putSchedule(db: DatabaseSync, cardId: number, schedule: Schedule | null): void {
  if (!schedule) {
    execute(db, DELETE_SCHEDULE_SQL, cardId);
    return;
  }
  execute(db, UPSERT_SCHEDULE_SQL, cardId, schedule.state.stability, schedule.state.difficulty,
    schedule.state.fastStability, schedule.lastReviewAt, schedule.dueAt,
    schedule.reviewCount, FSRS_VERSION, TARGET_RETENTION);
}
export function reviewCard(
  db: DatabaseSync, cardId: number, rating: Rating, now = new Date(), hooks?: ReviewHooks
): Schedule {
  if (![1, 2, 3, 4].includes(rating)) throw new ReviewError('Rating must be Again, Hard, Good or Easy.');
  const timestamp = checkedTime(now);
  db.exec('BEGIN IMMEDIATE');
  try {
    getCard(db, cardId);
    if (queryOne(db, IS_RETIRED_SQL, cardId))
      throw new ReviewError('Retired generated cards cannot be reviewed.');
    const before = readSchedule(db, cardId);
    hooks?.before?.(before);
    const elapsed = before ? (now.getTime() - Date.parse(before.lastReviewAt)) / DAY_MS : 0;
    if (!Number.isFinite(elapsed) || elapsed < 0) throw new ReviewError('Review time precedes previous review.');
    const recall = before ? retrievability(before.state, elapsed) : null;
    const state = nextMemoryState(before?.state ?? null, elapsed, rating);
    const days = nextIntervalDays(state, TARGET_RETENTION);
    const dueAt = new Date(now.getTime() + Math.max(1000, Math.round(days * DAY_MS))).toISOString();
    const after: Schedule = { state, lastReviewAt: timestamp, dueAt, reviewCount: (before?.reviewCount ?? 0) + 1 };
    putSchedule(db, cardId, after);
    const inserted = execute(db, INSERT_REVIEW_EVENT_SQL, cardId, rating, timestamp, before ? JSON.stringify(before) : null,
      JSON.stringify(after), elapsed, recall, FSRS_VERSION);
    hooks?.after?.(after, Number(inserted.lastInsertRowid));
    db.exec('COMMIT');
    return after;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function reviewHistory(db: DatabaseSync, cardId: number): ReviewEvent[] {
  getCard(db, cardId);
  return queryAll<ReviewEvent>(db, REVIEW_HISTORY_SQL, cardId);
}

/** Reverse the latest active review by restoring its saved pre-review snapshot. */
export function undoReview(
  db: DatabaseSync, cardId: number, now = new Date(), hooks?: UndoHooks
): Schedule | null {
  const timestamp = checkedTime(now);
  db.exec('BEGIN IMMEDIATE');
  try {
    getCard(db, cardId);
    const latest = queryOne<ReviewEvent>(db, LATEST_ACTIVE_REVIEW_SQL, cardId);
    if (!latest) throw new ReviewError('No active review to undo.');
    hooks?.before?.(latest.id);
    const current = readSchedule(db, cardId);
    if (!current || JSON.stringify(current) !== latest.after_json) {
      throw new ReviewError('Review history does not match current schedule.');
    }
    const before: Schedule | null = latest.before_json ? JSON.parse(latest.before_json) as Schedule : null;
    putSchedule(db, cardId, before);
    execute(db, INSERT_UNDO_EVENT_SQL, cardId, timestamp, JSON.stringify(current), before ? JSON.stringify(before) : null,
      latest.id, FSRS_VERSION);
    hooks?.after?.(latest.id);
    db.exec('COMMIT');
    return before;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function dueCards(db: DatabaseSync, deckId?: number, now = new Date()): DueCard[] {
  const timestamp = checkedTime(now);
  return queryAll<DueCard>(db, DUE_CARDS_SQL, timestamp, deckId ?? null, deckId ?? null);
}
