import { MAX_STUDY_LIMIT } from '../../constants.ts';
import type { StudyOptions, StudySession } from '../../models/study.ts';
import { parseDeckId } from '../deck/utils.ts';

const USAGE = 'Usage: study [deck-id] [--new | --all] [--new-limit N] [--review-limit N] [--restart] | study --resume';
const SHORTCUTS = 'Space/Enter: reveal; 1 Again, 2 Hard, 3 Good, 4 Easy; s skip; u undo; q quit.';

export interface StudyConfig {
  options: StudyOptions;
  behavior: 'auto' | 'resume' | 'restart';
}

export function showUsageInformation(): number {
  console.error(USAGE);
  return 1;
}

export function showHelpInformation(): number {
  console.log(USAGE);
  console.log(SHORTCUTS);
  return 0;
}

/**
 * Parses `study` arguments into session options.
 *
 * @returns The options and how to treat an unfinished session, or `null` if the
 *   arguments are malformed (unknown, repeated or conflicting flags).
 * @throws {DeckError} If the deck ID is not a positive integer.
 */
export function parseStudyArgs(args: string[]): StudyConfig | null {
  if (args.length === 1 && args[0] === '--resume') return { options: {}, behavior: 'resume' };
  const options: StudyOptions = {};
  let behavior: 'auto' | 'restart' = 'auto';
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--resume') return null;
    if (arg === '--restart' || arg === '--new' || arg === '--all') {
      if (seen.has(arg)) return null;
      seen.add(arg);
      if (arg === '--restart') behavior = 'restart';
      if (arg === '--new' || arg === '--all') {
        if (options.mode) return null;
        options.mode = arg === '--new' ? 'new' : 'all';
      }
    } else if (arg === '--new-limit' || arg === '--review-limit') {
      const value = args[++i];
      // Unlike IDs, a limit may be 0.
      if (seen.has(arg) || value === undefined || !/^(0|[1-9][0-9]*)$/.test(value)) return null;
      seen.add(arg);
      const limit = Number(value);
      if (!Number.isSafeInteger(limit) || limit > MAX_STUDY_LIMIT) return null;
      if (arg === '--new-limit') options.newLimit = limit;
      else options.reviewLimit = limit;
    } else if (!arg.startsWith('-') && options.deckId === undefined) {
      options.deckId = parseDeckId(arg);
    } else {
      return null;
    }
  }
  return { options, behavior };
}

export function describeProgress(session: StudySession): string {
  return `${session.done} reviewed, ${session.skipped} skipped, ${session.pending} remaining of ${session.total}`;
}
