import type { MemoryState, Rating } from '../fsrs/algorithm.ts';

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
export interface ReviewHooks {
  /** Called inside the review transaction to validate a session's queued snapshot. */
  before?: (before: Schedule | null) => void;
  /** Called inside the same transaction as the FSRS state and event insert. */
  after?: (after: Schedule, reviewEventId: number) => void;
}
export interface UndoHooks {
  before?: (reviewEventId: number) => void;
  after?: (reviewEventId: number) => void;
}
