import { DatabaseSync } from 'node:sqlite';
import process from 'node:process';
import { CardError, deleteCard, getCard } from '../../services/cards.ts';
import { showUsageInformation, parseCardId } from './utils.ts';
import { askQuestion } from './prompt.ts';

export async function runCardSubcommandDelete(db: DatabaseSync, args: string[]): Promise<number> {
  if (args.length < 1 || args.length > 2 || (args.length === 2 && args[1] !== '--yes')) return showUsageInformation();
  const cardId = parseCardId(args[0]);
  const card = getCard(db, cardId);
  if (!args.includes('--yes')) {
    if (!process.stdin.isTTY) throw new CardError('Deletion requires terminal confirmation or --yes.');
    const answer = await askQuestion(`Delete card ${card.id}? [y/N] `);
    if (!/^(y|yes)$/i.test(answer.trim())) {
      console.log('Deletion cancelled.');
      return 0;
    }
  }
  deleteCard(db, cardId);
  console.log(`Deleted card ${cardId}.`);
  return 0;
}
