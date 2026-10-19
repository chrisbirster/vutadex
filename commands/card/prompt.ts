import { CardError } from '../../services/cards.ts';
import { createTerminalInteraction } from '../terminal.ts';
import type { TerminalInteraction } from '../terminal.ts';

/** Keep the canonical card-prompt API while allowing deterministic terminal injection in tests. */
export async function promptForCardFields(
  existing?: { front: string; back: string },
  terminal: TerminalInteraction = createTerminalInteraction()
): Promise<{front: string; back: string}> {
  if (!terminal.isTTY) throw new CardError('Interactive entry requires a terminal; pass --front and --back.');
  return terminal.cardFields(existing);
}
