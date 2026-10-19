import { DatabaseSync } from 'node:sqlite';
import { createDeck } from '../../services/decks.ts';
import { showUsageInformation } from './utils.ts';


export function runDeckSubcommandCreate(db: DatabaseSync, args: string[]): number {
  const flag = args.indexOf('--description');
  if (flag >= 0 && (flag !== args.length - 2 || !args[flag + 1])) return showUsageInformation();
  const nameArgs = flag >= 0 ? args.slice(0, flag) : args;
  if (!nameArgs.length) return showUsageInformation();
  const deck = createDeck(db, nameArgs.join(' '), flag >= 0 ? args[flag + 1] ?? '' : null);
  console.log(`Created deck "${deck.name}" (ID: ${deck.id})`);
  return 0;
}
