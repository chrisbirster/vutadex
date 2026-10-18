import { getDatabase } from '../database/index.ts';
import { parsePositiveId } from '../services/cards.ts';
import { DeckError } from '../services/decks.ts';
import { ReviewError } from '../services/reviews.ts';
import { openStudySession, nextStudyItem, rateStudyCard, sessionSummary,
  skipStudyCard, undoLastStudyReview, finishStudySession, StudyError } from '../services/study.ts';
import type { StudyOptions, StudySession } from '../services/study.ts';
import type { Rating } from '../fsrs/algorithm.ts';
import { makeStudyInput } from './study-input.ts';
import { interactionForCard,needsAnswerInput,evaluateAnswer,answerPrompt } from '../services/study-interactions.ts';

function usage(): number {
  console.error('Usage: study [deck-id] [--new | --all] [--new-limit N] [--review-limit N] [--restart] | study --resume');
  return 1;
}
type Config = { options: StudyOptions; behavior: 'auto' | 'resume' | 'restart' };
function parseArgs(args: string[]): Config | null {
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
      if (seen.has(arg) || value === undefined || !/^(0|[1-9][0-9]*)$/.test(value)) return null;
      seen.add(arg);
      const n = Number(value);
      if (!Number.isSafeInteger(n) || n > 1000) return null;
      if (arg === '--new-limit') options.newLimit = n;
      else options.reviewLimit = n;
    } else if (!arg.startsWith('-') && options.deckId === undefined) {
      options.deckId = parsePositiveId(arg);
    } else return null;
  }
  return { options, behavior };
}
function progress(session: StudySession): string {
  return session.done + ' reviewed, ' + session.skipped + ' skipped, ' +
    session.pending + ' remaining of ' + session.total;
}

export async function runStudyCommand(args: string[]): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: study [deck-id] [--new | --all] [--new-limit N] [--review-limit N] [--restart] | study --resume');
    console.log('Space/Enter: reveal; 1 Again, 2 Hard, 3 Good, 4 Easy; s skip; u undo; q quit.');
    return 0;
  }
  let parsed: Config | null;
  try { parsed = parseArgs(args); }
  catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  if (!parsed) return usage();
  const db = getDatabase();
  try {
    const session = openStudySession(db, parsed.options, parsed.behavior);
    console.log('Session #' + session.id + ' (' + session.mode + ') — ' + progress(session) + '.');
    if (session.total === 0) {
      console.log('No matching cards to study.');
      return 0;
    }
    const input = makeStudyInput();
    try {
      while (true) {
        const item = nextStudyItem(db, session.id);
        if (!item) {
          const finished = finishStudySession(db, session.id);
          console.log('Session complete: ' + progress(finished) + '.');
          if (!finished.done) return 0;
          const action = await input.ask('Press u to undo the last rating, or Enter/q to finish: ');
          if (action !== 'u') return 0;
          try {
            const reopened = undoLastStudyReview(db, session.id);
            console.log('Reopened card #' + reopened + '.');
          } catch (error) {
            console.error(error instanceof Error ? error.message : String(error));
            return 1;
          }
          continue;
        }
        const current = sessionSummary(db, session.id);
        console.log('\nCard #' + item.cardId + ' [' + item.kind + '] — ' + progress(current));
        console.log('Front:\n' + item.front);
        let restartCard = false;
        let revealed = false;
        const interaction = interactionForCard(db,item.cardId);
        while (!restartCard) {
          if (!revealed && needsAnswerInput(interaction)) {
            const response = await input.askText(answerPrompt(interaction));
            if (response === null || response.trim() === '/quit') {
              console.log('Session paused. Run study --resume to continue.');
              return 0;
            }
            if (response.trim() === '/skip') {
              const updated = skipStudyCard(db, session.id, item.cardId);
              console.log('Skipped. ' + progress(updated) + '.');
              restartCard = true;
              continue;
            }
            const result = evaluateAnswer(interaction,response);
            console.log(result.correct?'Correct answer.':'Not quite.');
            console.log('Expected: ' + result.expected);
            console.log('Back:\n' + item.back);
            console.log('Choose your own FSRS rating; correctness does not automatically set Easy.');
            revealed = true;
            continue;
          }
          const action = await input.ask(revealed
            ? 'Rating [1 Again / 2 Hard / 3 Good / 4 Easy] (s skip, u undo, q quit): '
            : 'Reveal [Space/Enter] (s skip, u undo, q quit): ');
          if (action === null || action === 'q') {
            console.log('Session paused. Run study --resume to continue.');
            return 0;
          }
          if (action === 'u') {
            try {
              console.log('Undid rating for card #' + undoLastStudyReview(db, session.id) + '.');
            } catch (error) {
              console.log(error instanceof Error ? error.message : String(error));
            }
            restartCard = true;
          } else if (action === 's') {
            const updated = skipStudyCard(db, session.id, item.cardId);
            console.log('Skipped. ' + progress(updated) + '.');
            restartCard = true;
          } else if (!revealed && (action === '' || action === 'r')) {
            console.log('Back:\n' + item.back);
            revealed = true;
          } else if (revealed && ['1', '2', '3', '4'].includes(action)) {
            try {
              const schedule = rateStudyCard(db, session.id, item.cardId, Number(action) as Rating);
              console.log('Recorded ' + ['', 'Again', 'Hard', 'Good', 'Easy'][Number(action)] + '. Due ' + schedule.dueAt + '.');
            } catch (error) {
              if (error instanceof StudyError || error instanceof ReviewError || error instanceof DeckError) {
                console.error(error.message);
                return 1;
              }
              throw error;
            }
            restartCard = true;
          } else {
            console.log(revealed
              ? 'Reveal completed. Choose 1-4, or s/u/q.'
              : 'Reveal the answer before giving a rating. Press Space/Enter.');
          }
        }
      }
    } finally {
      input.close();
    }
  } catch (error) {
    if (error instanceof StudyError || error instanceof DeckError || error instanceof ReviewError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  } finally {
    db.close();
  }
}
