import type { DatabaseSync } from 'node:sqlite';
import { getCard } from './cards.ts';
import { FSRS_VERSION } from '../fsrs/parameters.ts';
import { retrievability, nextMemoryState, nextIntervalDays } from '../fsrs/algorithm.ts';
import type { MemoryState, Rating } from '../fsrs/algorithm.ts';

const DAY_MS = 86400000;
export const TARGET_RETENTION = 0.9;
export class ReviewError extends Error {}

export type Schedule = {
  state: MemoryState;
  lastReviewAt: string;
  dueAt: string;
  reviewCount: number;
};
export interface DueCard {
  id: number;
  deck_id: number;
  front: string;
  due_at: string | null;
  review_count: number;
}
export type ReviewEvent = {
  id: number; card_id: number; event_type: 'review' | 'undo';
  rating: Rating | null; occurred_at: string;
  before_json: string | null; after_json: string | null;
  elapsed_days: number | null; retrievability_before: number | null;
  undone_review_id: number | null; scheduler_version: string;
};

function checkedTime(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new ReviewError('Invalid review date.');
  return now.toISOString();
}
function readSchedule(db: DatabaseSync, cardId: number): Schedule | null {
  const row = db.prepare('SELECT * FROM card_schedules WHERE card_id = ?').get(cardId) as
    | { stability: number; difficulty: number; fast_stability: number;
        last_review_at: string; due_at: string; review_count: number; scheduler_version: string }
    | undefined;
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
    db.prepare('DELETE FROM card_schedules WHERE card_id = ?').run(cardId);
    return;
  }
  db.prepare(`
    INSERT INTO card_schedules
      (card_id, stability, difficulty, fast_stability, last_review_at, due_at, review_count, scheduler_version, target_retention)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(card_id) DO UPDATE SET
      stability=excluded.stability, difficulty=excluded.difficulty,
      fast_stability=excluded.fast_stability, last_review_at=excluded.last_review_at,
      due_at=excluded.due_at, review_count=excluded.review_count,
      scheduler_version=excluded.scheduler_version, target_retention=excluded.target_retention
  `).run(cardId, schedule.state.stability, schedule.state.difficulty,
    schedule.state.fastStability, schedule.lastReviewAt, schedule.dueAt,
    schedule.reviewCount, FSRS_VERSION, TARGET_RETENTION);
}
export interface ReviewHooks {
  /** Called inside the review transaction to validate a session's queued snapshot. */
  before?: (before: Schedule | null) => void;
  /** Called inside the same transaction as the FSRS state and event insert. */
  after?: (after: Schedule, reviewEventId: number) => void;
}

export function reviewCard(
  db: DatabaseSync, cardId: number, rating: Rating, now = new Date(), hooks?: ReviewHooks
): Schedule {
  if (![1, 2, 3, 4].includes(rating)) throw new ReviewError('Rating must be Again, Hard, Good or Easy.');
  const timestamp = checkedTime(now);
  db.exec('BEGIN IMMEDIATE');
  try {
    getCard(db, cardId);
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
    const inserted = db.prepare(`
      INSERT INTO review_events
      (card_id, event_type, rating, occurred_at, before_json, after_json, elapsed_days, retrievability_before, scheduler_version)
      VALUES (?, 'review', ?, ?, ?, ?, ?, ?, ?)
    `).run(cardId, rating, timestamp, before ? JSON.stringify(before) : null,
      JSON.stringify(after), elapsed, recall, FSRS_VERSION);
    hooks?.after?.(after, Number(inserted.lastInsertRowid));
    db.exec('COMMIT');
    return after;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function reviewHistory(db: DatabaseSync, cardId: number): ReviewEvent[] {
  getCard(db, cardId);
  return db.prepare('SELECT * FROM review_events WHERE card_id = ? ORDER BY id').all(cardId) as unknown as ReviewEvent[];
}

/** Reverse the latest active review by restoring its saved pre-review snapshot. */
export interface UndoHooks {
  before?: (reviewEventId: number) => void;
  after?: (reviewEventId: number) => void;
}

export function undoReview(
  db: DatabaseSync, cardId: number, now = new Date(), hooks?: UndoHooks
): Schedule | null {
  const timestamp = checkedTime(now);
  db.exec('BEGIN IMMEDIATE');
  try {
    getCard(db, cardId);
    const latest = db.prepare(`
      SELECT r.* FROM review_events r
      WHERE r.card_id = ? AND r.event_type = 'review'
        AND NOT EXISTS (SELECT 1 FROM review_events u WHERE u.undone_review_id = r.id)
      ORDER BY r.id DESC LIMIT 1
    `).get(cardId) as ReviewEvent | undefined;
    if (!latest) throw new ReviewError('No active review to undo.');
    hooks?.before?.(latest.id);
    const current = readSchedule(db, cardId);
    if (!current || JSON.stringify(current) !== latest.after_json) {
      throw new ReviewError('Review history does not match current schedule.');
    }
    const before: Schedule | null = latest.before_json ? JSON.parse(latest.before_json) as Schedule : null;
    putSchedule(db, cardId, before);
    db.prepare(`
      INSERT INTO review_events
      (card_id, event_type, rating, occurred_at, before_json, after_json, undone_review_id, scheduler_version)
      VALUES (?, 'undo', NULL, ?, ?, ?, ?, ?)
    `).run(cardId, timestamp, JSON.stringify(current), before ? JSON.stringify(before) : null,
      latest.id, FSRS_VERSION);
    hooks?.after?.(latest.id);
    db.exec('COMMIT');
    return before;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function dueCards(db: DatabaseSync, deckId?: number, now = new Date()): DueCard[] {
  const timestamp = checkedTime(now);
  const sql = `
    SELECT c.id, c.deck_id, c.front, s.due_at, COALESCE(s.review_count, 0) AS review_count
    FROM cards c LEFT JOIN card_schedules s ON s.card_id = c.id
    WHERE (s.due_at IS NULL OR s.due_at <= ?)
  ` + (deckId === undefined ? '' : ' AND c.deck_id = ?') +
      ' ORDER BY COALESCE(s.due_at, \'\'), c.id';
  return db.prepare(sql).all(...(deckId === undefined ? [timestamp] : [timestamp, deckId])) as unknown as DueCard[];
}
