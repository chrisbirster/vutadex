export interface DueDay {
  /** UTC calendar date; snapshots are based on the existing FSRS due_at values. */
  date: string;
  scheduled: number;
}

export interface StudyProgress {
  asOf: string;
  timezone: 'UTC';
  deckId: number | null;
  totalCards: number;
  newCards: number;
  reviewedCards: number;
  /** Scheduled cards due at or before the instant asOf (does not include new cards). */
  dueNow: number;
  /** Scheduled before today's UTC midnight, not duplicated in daily buckets. */
  overdueBeforeToday: number;
  /** Scheduled on each UTC date, including cards already due earlier today. */
  forecast: DueDay[];
  /** Non-undone ratings for active cards, in the trailing seven 24-hour periods. */
  reviewsLast7Days: number;
  ratingsLast7Days: { again: number; hard: number; good: number; easy: number };
  /** Includes globally scoped sessions only for global statistics. */
  completedSessions: number;
}
