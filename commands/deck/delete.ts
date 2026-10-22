import type { DatabaseSync } from 'node:sqlite';
import { deleteDeck, getDeck } from '../../services/decks.ts';
import type { Deck } from '../../models/deck.ts';
import { parseCommandArgs } from '../utils.ts';
import { createTerminalInteraction } from '../terminal.ts';
import type { TerminalInteraction } from '../terminal.ts';
import { showUsageInformation, parseDeckId } from './utils.ts';

type DeletionDecision = 'confirmed' | 'cancelled' | 'needs-terminal';

async function decideDeletion(deck: Deck, skipConfirmation: boolean, terminal: TerminalInteraction): Promise<DeletionDecision> {
  if (skipConfirmation) return 'confirmed';
  if (terminal.isTTY) {
    const isConfirmed = await terminal.confirm(`Delete deck "${deck.name}" and its cards? [y/N] `);
    return isConfirmed ? 'confirmed' : 'cancelled';
  }
  return 'needs-terminal';
}

export async function runDeckSubcommandDelete(
  db: DatabaseSync, args: string[], terminal: TerminalInteraction = createTerminalInteraction()
): Promise<number> {
  const parsedArgs = parseCommandArgs(args, ['yes'], 1, 1);
  if (!parsedArgs) return showUsageInformation();
  const deck = getDeck(db, parseDeckId(parsedArgs.positionals[0]));
  switch (await decideDeletion(deck, parsedArgs.flags.yes, terminal)) {
    case 'cancelled':
      console.log('Deletion cancelled.');
      return 0;
    case 'needs-terminal':
      console.error('Deletion requires confirmation in a terminal or --yes.');
      return 1;
    case 'confirmed':
      deleteDeck(db, deck.id);
      console.log(`Deleted deck ${deck.id}.`);
      return 0;
  }
}
