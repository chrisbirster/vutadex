import { DatabaseSync } from 'node:sqlite';
import { CardError, deleteCard, getCard } from '../../services/cards.ts';
import { showUsageInformation, parseCardId } from './utils.ts';
import { parseCommandArgs } from '../utils.ts';
import { createTerminalInteraction } from '../terminal.ts';
import type { TerminalInteraction } from '../terminal.ts';


export async function runCardSubcommandDelete(db: DatabaseSync, args: string[], terminal: TerminalInteraction = createTerminalInteraction()): Promise<number> {
  const parsed = parseCommandArgs(args, ['yes'], 1, 1);
  if (!parsed) return showUsageInformation();
  const cardId = parseCardId(parsed.positionals[0]);
  const card = getCard(db, cardId);
  if (!parsed.flags.yes) {
    if (!terminal.isTTY) throw new CardError('Deletion requires terminal confirmation or --yes.');
    const confirmed = await terminal.confirm(`Delete card ${card.id}? [y/N] `);
    if (!confirmed) {
      console.log('Deletion cancelled.');
      return 0;
    }
  }
  deleteCard(db, cardId);
  console.log(`Deleted card ${cardId}.`);
  return 0;
}
