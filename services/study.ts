import type { DatabaseSync } from 'node:sqlite';
import { getDeck } from './decks.ts';
import { reviewCard, undoReview } from './reviews.ts';
import type { Rating } from '../fsrs/algorithm.ts';
import { execute, loadQueryByFilename, queryAll, queryOne } from '../database/sql.ts';
import { DEFAULT_NEW_LIMIT, DEFAULT_REVIEW_LIMIT, MAX_STUDY_LIMIT } from '../constants.ts';
import type { Schedule } from '../models/review.ts';
import type {
  SessionItemStatus, SessionStatus, StudyItem, StudyMode, StudyOptions, StudySession,
} from '../models/study.ts';

const ACTIVE_SESSION_SQL = loadQueryByFilename('study/active-session.sql');
const GET_SESSION_SQL = loadQueryByFilename('study/get-session.sql');
const SESSION_COUNTS_SQL = loadQueryByFilename('study/session-counts.sql');
const SKIP_RETIRED_ITEMS_SQL = loadQueryByFilename('study/skip-retired-items.sql');
const HAS_PENDING_ITEM_SQL = loadQueryByFilename('study/has-pending-item.sql');
const COMPLETE_SESSION_SQL = loadQueryByFilename('study/complete-session.sql');
const ABANDON_SESSION_SQL = loadQueryByFilename('study/abandon-session.sql');
const CREATE_SESSION_SQL = loadQueryByFilename('study/create-session.sql');
const CANDIDATES_SQL = loadQueryByFilename('study/candidates.sql');
const INSERT_ITEM_SQL = loadQueryByFilename('study/insert-item.sql');
const NEXT_ITEM_SQL = loadQueryByFilename('study/next-item.sql');
const GET_ITEM_SQL = loadQueryByFilename('study/get-item.sql');
const SKIP_ITEM_SQL = loadQueryByFilename('study/skip-item.sql');
const TOUCH_SESSION_SQL = loadQueryByFilename('study/touch-session.sql');
const COMPLETE_ITEM_SQL = loadQueryByFilename('study/complete-item.sql');
const LAST_DONE_ITEM_SQL = loadQueryByFilename('study/last-done-item.sql');
const REOPEN_ITEM_SQL = loadQueryByFilename('study/reopen-item.sql');
const REOPEN_SESSION_SQL = loadQueryByFilename('study/reopen-session.sql');

export class StudyError extends Error { }
type SessionRow = {
  id: number; deck_id: number | null; mode: StudyMode;
  new_limit: number; review_limit: number;
  status: SessionStatus;
};
type ItemRow = {
  session_id: number; card_id: number; kind: 'new' | 'review';
  status: SessionItemStatus; starting_review_count: number;
  starting_last_review_at: string | null; review_event_id: number | null;
};
type Candidate = {
  card_id: number; kind: 'new' | 'review';
  review_count: number; last_review_at: string | null;
};

const timestamp = (date: Date): string => {
  if (!Number.isFinite(date.getTime())) throw new StudyError('Invalid session date.');
  return date.toISOString();
};
function limits(options: StudyOptions): Required<Omit<StudyOptions, 'deckId'>> {
  const mode = options.mode ?? 'due';
  const newLimit = options.newLimit ?? DEFAULT_NEW_LIMIT;
  const reviewLimit = options.reviewLimit ?? DEFAULT_REVIEW_LIMIT;
  if (!['due', 'new', 'all'].includes(mode)) throw new StudyError('Invalid study mode.');
  if (![newLimit, reviewLimit].every(value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_STUDY_LIMIT)) {
    throw new StudyError(`New and review limits must be integers from 0 to ${MAX_STUDY_LIMIT}.`);
  }
  return { mode, newLimit, reviewLimit };
}
function getActive(db: DatabaseSync): SessionRow | undefined {
  return queryOne<SessionRow>(db, ACTIVE_SESSION_SQL);
}
function getSessionRow(db: DatabaseSync, sessionId: number): SessionRow {
  const session = queryOne<SessionRow>(db, GET_SESSION_SQL, sessionId);
  if (!session) throw new StudyError('Study session not found.');
  return session;
}
export function sessionSummary(db: DatabaseSync, sessionId: number): StudySession {
  const row = getSessionRow(db, sessionId);
  const counts = queryOne<{ total: number; pending: number; done: number; skipped: number }>(
    db, SESSION_COUNTS_SQL, sessionId)!; // an aggregate query always returns one row
  return {
    id: row.id, deckId: row.deck_id, mode: row.mode,
    newLimit: row.new_limit, reviewLimit: row.review_limit,
    status: row.status, ...counts
  };
}

function finishIfEmpty(db: DatabaseSync, sessionId: number, now: string): void {
  execute(db, SKIP_RETIRED_ITEMS_SQL, sessionId);
  const hasPending = queryOne(db, HAS_PENDING_ITEM_SQL, sessionId);
  if (!hasPending) {
    execute(db, COMPLETE_SESSION_SQL, now, sessionId);
  }
}
export function openStudySession(
  db: DatabaseSync, options: StudyOptions = {},
  behavior: 'auto' | 'resume' | 'restart' = 'auto',
  now = new Date()
): StudySession {
  const iso = timestamp(now);
  const config = limits(options);
  db.exec('BEGIN IMMEDIATE');
  try {
    let active = getActive(db);
    if (active) {
      finishIfEmpty(db, active.id, iso);
      active = getActive(db);
    }
    if (active && behavior !== 'restart') {
      if (behavior === 'auto' && (
        active.deck_id !== (options.deckId ?? null) || active.mode !== config.mode ||
        active.new_limit !== config.newLimit || active.review_limit !== config.reviewLimit
      )) {
        throw new StudyError('An unfinished session exists with different options. Use study --resume or study --restart.');
      }
      db.exec('COMMIT');
      return sessionSummary(db, active.id);
    }
    if (behavior === 'resume') throw new StudyError('No unfinished study session to resume.');
    if (active) execute(db, ABANDON_SESSION_SQL, iso, active.id);
    if (options.deckId !== undefined) getDeck(db, options.deckId);
    const created = execute(db, CREATE_SESSION_SQL, options.deckId ?? null, config.mode, config.newLimit, config.reviewLimit, iso, iso);
    const sessionId = Number(created.lastInsertRowid);
    const candidates = queryAll<Candidate>(db, CANDIDATES_SQL, options.deckId ?? null, options.deckId ?? null, config.mode, config.mode, config.mode, iso);
    let newCount = 0;
    let reviewCount = 0;
    let position = 0;
    const insert = db.prepare(INSERT_ITEM_SQL);
    for (const card of candidates) {
      if (card.kind === 'new') {
        if (newCount >= config.newLimit) continue;
        newCount++;
      } else {
        if (reviewCount >= config.reviewLimit) continue;
        reviewCount++;
      }
      insert.run(sessionId, card.card_id, position++, card.kind, card.review_count, card.last_review_at);
    }
    finishIfEmpty(db, sessionId, iso);
    db.exec('COMMIT');
    return sessionSummary(db, sessionId);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
/** Finalize a queue whose last pending item was deleted outside the session. */
export function finishStudySession(db: DatabaseSync, sessionId: number, now = new Date()): StudySession {
  const iso = timestamp(now);
  db.exec('BEGIN IMMEDIATE');
  try {
    getSessionRow(db, sessionId);
    finishIfEmpty(db, sessionId, iso);
    db.exec('COMMIT');
    return sessionSummary(db, sessionId);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function nextStudyItem(db: DatabaseSync, sessionId: number): StudyItem | null {
  getSessionRow(db, sessionId);
  return queryOne<StudyItem>(db, NEXT_ITEM_SQL, sessionId) ?? null;
}
function requirePending(db: DatabaseSync, sessionId: number, cardId: number): ItemRow {
  if (getSessionRow(db, sessionId).status !== 'active') throw new StudyError('Study session is no longer active.');
  const item = queryOne<ItemRow>(db, GET_ITEM_SQL, sessionId, cardId);
  if (!item || item.status !== 'pending') throw new StudyError('Card already processed in this session.');
  return item;
}
export function skipStudyCard(db: DatabaseSync, sessionId: number, cardId: number, now = new Date()): StudySession {
  const iso = timestamp(now);
  db.exec('BEGIN IMMEDIATE');
  try {
    requirePending(db, sessionId, cardId);
    execute(db, SKIP_ITEM_SQL, sessionId, cardId);
    execute(db, TOUCH_SESSION_SQL, iso, sessionId);
    finishIfEmpty(db, sessionId, iso);
    db.exec('COMMIT');
    return sessionSummary(db, sessionId);
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function rateStudyCard(
  db: DatabaseSync, sessionId: number, cardId: number, rating: Rating, now = new Date()
): Schedule {
  const iso = timestamp(now);
  return reviewCard(db, cardId, rating, now, {
    before: before => {
      const item = requirePending(db, sessionId, cardId);
      if ((before?.reviewCount ?? 0) !== item.starting_review_count ||
        (before?.lastReviewAt ?? null) !== item.starting_last_review_at) {
        throw new StudyError('Card was reviewed outside this session. Skip it or restart the session.');
      }
    },
    after: (_after, eventId) => {
      execute(db, COMPLETE_ITEM_SQL, eventId, sessionId, cardId);
      execute(db, TOUCH_SESSION_SQL, iso, sessionId);
      finishIfEmpty(db, sessionId, iso);
    }
  });
}
export function undoLastStudyReview(db: DatabaseSync, sessionId: number, now = new Date()): number {
  const iso = timestamp(now);
  const row = queryOne<{ card_id: number; review_event_id: number }>(db, LAST_DONE_ITEM_SQL, sessionId);
  if (!row) throw new StudyError('There is no session review to undo.');
  // Both FSRS rollback and queue reopening are committed in one transaction.
  undoReview(db, row.card_id, now, {
    before: eventId => {
      if (eventId !== row.review_event_id) throw new StudyError('Card changed outside this session; cannot undo safely.');
      const session = getSessionRow(db, sessionId);
      if (session.status !== 'active' && session.status !== 'completed') throw new StudyError('Session was abandoned.');
    },
    after: () => {
      execute(db, REOPEN_ITEM_SQL, sessionId, row.card_id);
      execute(db, REOPEN_SESSION_SQL, iso, sessionId);
    }
  });
  return row.card_id;
}
