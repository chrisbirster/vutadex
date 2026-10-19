import { DatabaseSync } from 'node:sqlite';
import { editCard, getCard } from '../../services/cards.ts';
import { showUsageInformation, parseCardId, parseCardFields } from './utils.ts';
import { promptForCardFields } from './prompt.ts';
import { createTerminalInteraction } from '../terminal.ts';
import type { TerminalInteraction } from '../terminal.ts';


export async function runCardSubcommandEdit(db: DatabaseSync, args: string[], terminal: TerminalInteraction = createTerminalInteraction()): Promise<number> {
  if (!args.length) return showUsageInformation();
  const cardId = parseCardId(args[0]);
  const fields = parseCardFields(args.slice(1));
  if (!fields) return showUsageInformation();
  const values = fields.front === undefined && fields.back === undefined
    ? await promptForCardFields(getCard(db, cardId), terminal)
    : fields;
  const card = editCard(db, cardId, values.front, values.back);
  console.log(`Updated card ${card.id}.`);
  return 0;
}
