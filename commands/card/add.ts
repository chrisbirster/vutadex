import { DatabaseSync } from 'node:sqlite';
import { createCard } from '../../services/cards.ts';
import { getDeck } from '../../services/decks.ts';
import { parseDeckId } from '../deck/utils.ts';
import { showUsageInformation, parseCardFields } from './utils.ts';
import { promptForCardFields } from './prompt.ts';

export async function runCardSubcommandAdd(db: DatabaseSync, args: string[]): Promise<number> {
  if (!args.length) return showUsageInformation();
  const deckId = parseDeckId(args[0]);
  const fields = parseCardFields(args.slice(1));
  if (!fields) return showUsageInformation();
  getDeck(db, deckId);
  const values = fields.front === undefined && fields.back === undefined ? await promptForCardFields() : fields;
  if (values.front === undefined || values.back === undefined) return showUsageInformation();
  const card = createCard(db, deckId, values.front, values.back);
  console.log(`Created card ${card.id} in deck ${card.deck_id}.`);
  return 0;
}
