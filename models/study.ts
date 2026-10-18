export type StudyMode = 'due' | 'new' | 'all';
export type SessionStatus = 'active' | 'completed' | 'abandoned';
export type SessionItemStatus = 'pending' | 'done' | 'skipped';

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
