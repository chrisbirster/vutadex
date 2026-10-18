import type { DatabaseSync } from 'node:sqlite';
import { getDeck } from './decks.ts';
import { reviewCard, undoReview } from './reviews.ts';
import type { Schedule } from './reviews.ts';
import type { Rating } from '../fsrs/algorithm.ts';

export type StudyMode = 'due' | 'new' | 'all';
export type SessionStatus = 'active' | 'completed' | 'abandoned';
export type SessionItemStatus = 'pending' | 'done' | 'skipped';

export class StudyError extends Error {}
export interface StudyOptions {
  deckId?: number;
  mode?: StudyMode;
  newLimit?: number;
  reviewLimit?: number;
}
export interface StudySession {
  id: number;
  deckId: number | null;
  mode: StudyMode;
  newLimit: number;
  reviewLimit: number;
  status: SessionStatus;
  total: number;
  pending: number;
  done: number;
  skipped: number;
}
export interface StudyItem {
  cardId: number;
  deckId: number;
  front: string;
  back: string;
  kind: 'new' | 'review';
  position: number;
}
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
  const newLimit = options.newLimit ?? 20;
  const reviewLimit = options.reviewLimit ?? 100;
  if (!['due', 'new', 'all'].includes(mode)) throw new StudyError('Invalid study mode.');
  if (![newLimit, reviewLimit].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 1000)) {
    throw new StudyError('New and review limits must be integers from 0 to 1000.');
  }
  return { mode, newLimit, reviewLimit };
}
function getActive(db: DatabaseSync): SessionRow | undefined {
  return db.prepare("SELECT * FROM study_sessions WHERE status = 'active'").get() as SessionRow | undefined;
}
function getSessionRow(db: DatabaseSync, sessionId: number): SessionRow {
  const session = db.prepare('SELECT * FROM study_sessions WHERE id = ?').get(sessionId) as SessionRow | undefined;
  if (!session) throw new StudyError('Study session not found.');
  return session;
}
export function sessionSummary(db: DatabaseSync, sessionId: number): StudySession {
  const row = getSessionRow(db, sessionId);
  const counts = db.prepare(`
    SELECT COUNT(*) AS total,
      COALESCE(SUM(status = 'pending'), 0) AS pending,
      COALESCE(SUM(status = 'done'), 0) AS done,
      COALESCE(SUM(status = 'skipped'), 0) AS skipped
    FROM study_session_items WHERE session_id = ?
  `).get(sessionId) as { total: number; pending: number; done: number; skipped: number };
  return { id: row.id, deckId: row.deck_id, mode: row.mode,
    newLimit: row.new_limit, reviewLimit: row.review_limit,
    status: row.status, ...counts };
}

function finishIfEmpty(db: DatabaseSync, sessionId: number, now: string): void {
  db.prepare(`
    UPDATE study_session_items SET status='skipped'
    WHERE session_id=? AND status='pending' AND card_id IN
      (SELECT card_id FROM generated_cards WHERE retired=1)
  `).run(sessionId);
  const hasPending = db.prepare("SELECT 1 FROM study_session_items WHERE session_id = ? AND status = 'pending' LIMIT 1").get(sessionId);
  if (!hasPending) {
    db.prepare("UPDATE study_sessions SET status='completed', updated_at=? WHERE id=? AND status='active'")
      .run(now, sessionId);
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
    if (active) db.prepare("UPDATE study_sessions SET status='abandoned', updated_at=? WHERE id=?").run(iso, active.id);
    if (options.deckId !== undefined) getDeck(db, options.deckId);
    const created = db.prepare(`
      INSERT INTO study_sessions(deck_id, mode, new_limit, review_limit, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?)
    `).run(options.deckId ?? null, config.mode, config.newLimit, config.reviewLimit, iso, iso);
    const sessionId = Number(created.lastInsertRowid);
    const candidates = db.prepare(`
      SELECT c.id AS card_id,
        CASE WHEN s.card_id IS NULL THEN 'new' ELSE 'review' END AS kind,
        COALESCE(s.review_count, 0) AS review_count,
        s.last_review_at
      FROM cards c LEFT JOIN card_schedules s ON s.card_id = c.id
      LEFT JOIN generated_cards g ON g.card_id = c.id
      WHERE (g.card_id IS NULL OR g.retired=0)
        AND (? IS NULL OR c.deck_id = ?)
        AND (? = 'all' OR (? = 'new' AND s.card_id IS NULL)
             OR (? = 'due' AND (s.card_id IS NULL OR s.due_at <= ?)))
      ORDER BY CASE WHEN s.card_id IS NULL THEN 1 ELSE 0 END,
               s.due_at, c.id
    `).all(options.deckId ?? null, options.deckId ?? null, config.mode, config.mode, config.mode, iso) as unknown as Candidate[];
    let newCount = 0;
    let reviewCount = 0;
    let position = 0;
    const insert = db.prepare(`
      INSERT INTO study_session_items
        (session_id, card_id, position, kind, starting_review_count, starting_last_review_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
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
  return db.prepare(`
    SELECT c.id AS cardId, c.deck_id AS deckId, c.front, c.back, i.kind, i.position
    FROM study_session_items i JOIN cards c ON c.id = i.card_id
    LEFT JOIN generated_cards g ON g.card_id=c.id
    WHERE i.session_id = ? AND i.status = 'pending' AND (g.card_id IS NULL OR g.retired=0)
    ORDER BY i.position LIMIT 1
  `).get(sessionId) as StudyItem | undefined ?? null;
}
function requirePending(db: DatabaseSync, sessionId: number, cardId: number): ItemRow {
  if (getSessionRow(db, sessionId).status !== 'active') throw new StudyError('Study session is no longer active.');
  const item = db.prepare('SELECT * FROM study_session_items WHERE session_id=? AND card_id=?')
    .get(sessionId, cardId) as ItemRow | undefined;
  if (!item || item.status !== 'pending') throw new StudyError('Card already processed in this session.');
  return item;
}
export function skipStudyCard(db: DatabaseSync, sessionId: number, cardId: number, now = new Date()): StudySession {
  const iso = timestamp(now);
  db.exec('BEGIN IMMEDIATE');
  try {
    requirePending(db, sessionId, cardId);
    db.prepare("UPDATE study_session_items SET status='skipped' WHERE session_id=? AND card_id=?")
      .run(sessionId, cardId);
    db.prepare('UPDATE study_sessions SET updated_at=? WHERE id=?').run(iso, sessionId);
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
      db.prepare("UPDATE study_session_items SET status='done', review_event_id=? WHERE session_id=? AND card_id=?")
        .run(eventId, sessionId, cardId);
      db.prepare('UPDATE study_sessions SET updated_at=? WHERE id=?').run(iso, sessionId);
      finishIfEmpty(db, sessionId, iso);
    }
  });
}
export function undoLastStudyReview(db: DatabaseSync, sessionId: number, now = new Date()): number {
  const iso = timestamp(now);
  const row = db.prepare(`
    SELECT card_id, review_event_id FROM study_session_items
    WHERE session_id=? AND status='done' AND review_event_id IS NOT NULL
    ORDER BY review_event_id DESC LIMIT 1
  `).get(sessionId) as { card_id: number; review_event_id: number } | undefined;
  if (!row) throw new StudyError('There is no session review to undo.');
  // Both FSRS rollback and queue reopening are committed in one transaction.
  undoReview(db, row.card_id, now, {
    before: eventId => {
      if (eventId !== row.review_event_id) throw new StudyError('Card changed outside this session; cannot undo safely.');
      const session = getSessionRow(db, sessionId);
      if (session.status !== 'active' && session.status !== 'completed') throw new StudyError('Session was abandoned.');
    },
    after: () => {
      db.prepare("UPDATE study_session_items SET status='pending', review_event_id=NULL WHERE session_id=? AND card_id=?")
        .run(sessionId, row.card_id);
      db.prepare("UPDATE study_sessions SET status='active', updated_at=? WHERE id=?")
        .run(iso, sessionId);
    }
  });
  return row.card_id;
}
