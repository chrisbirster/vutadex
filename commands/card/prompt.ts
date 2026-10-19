import { createInterface } from 'node:readline/promises';
import process from 'node:process';
import { CardError } from '../../services/cards.ts';

/** Asks `question` on the terminal and returns the raw answer. */
export async function askQuestion(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

/**
 * Prompts for both sides of a card. A blank answer keeps the matching side of `existing`.
 * `\n` in an answer becomes a newline.
 *
 * @throws {CardError} If stdin is not a terminal.
 */
export async function promptForCardFields(existing?: { front: string; back: string }): Promise<{ front: string; back: string }> {
  if (!process.stdin.isTTY) throw new CardError('Interactive entry requires a terminal; pass --front and --back.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const front = await rl.question('Front (use \\n for newlines): ');
    const back = await rl.question('Back (use \\n for newlines): ');
    return {
      front: (front || existing?.front || '').replace(/\\n/g, '\n'),
      back: (back || existing?.back || '').replace(/\\n/g, '\n')
    };
  } finally {
    rl.close();
  }
}
