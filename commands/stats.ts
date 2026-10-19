import { getDatabase } from '../database/index.ts';
import { getStudyProgress } from '../services/progress.ts';
import { parseDeckId } from './deck/utils.ts';

const USAGE = 'Usage: stats [deck-id] [--days 1..90]';

export function runStatsCommand(args: string[]): number {
  try {
    let deckId: number | undefined;
    let days = 7;
    let foundDays = false;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      if (arg === '--days' && !foundDays) {
        const value = args[++i];
        if (!value || !/^[0-9]+$/.test(value)) throw new Error(USAGE);
        days = Number(value);
        foundDays = true;
      } else if (!arg.startsWith('-') && deckId === undefined) {
        deckId = parseDeckId(arg);
      } else {
        throw new Error(USAGE);
      }
    }
    if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error(USAGE);
    const db = getDatabase();
    try {
      const summary = getStudyProgress(db, deckId, new Date(), days);
      console.log('Study statistics (' + (deckId === undefined ? 'all decks' : 'deck ' + deckId) + ')');
      console.log('As of ' + summary.asOf + ' — daily boundaries UTC');
      console.table({
        'Active cards': summary.totalCards,
        'New cards': summary.newCards,
        'Reviewed cards': summary.reviewedCards,
        'Scheduled due now': summary.dueNow,
        'Overdue before today': summary.overdueBeforeToday,
        'Ratings in last 7 days': summary.reviewsLast7Days,
        'Completed sessions': summary.completedSessions
      });
      console.log('Recent non-undone ratings:');
      console.table(summary.ratingsLast7Days);
      console.log('Scheduled due dates (' + days + ' UTC days; no new cards or overdue carryover):');
      console.table(summary.forecast);
      return 0;
    } finally { db.close(); }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
