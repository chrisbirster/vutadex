import { DatabaseSync } from 'node:sqlite';
import { CardError, deleteCard, getCard } from '../../services/cards.ts';
import { showUsageInformation, parseCardId } from './utils.ts';
import { createTerminalInteraction } from '../terminal.ts';
import type { TerminalInteraction } from '../terminal.ts';


export async function runCardSubcommandDelete(db: DatabaseSync, args: string[], terminal: TerminalInteraction = createTerminalInteraction()): Promise<number> {
  if (args.length < 1 || args.length > 2 || (args.length === 2 && args[1] !== '--yes')) return showUsageInformation();
  const cardId = parseCardId(args[0]);
  const card = getCard(db, cardId);
  if (!args.includes('--yes')) {
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
