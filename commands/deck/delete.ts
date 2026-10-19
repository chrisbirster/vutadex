import { DatabaseSync } from 'node:sqlite';
import { deleteDeck, getDeck } from '../../services/decks.ts';
import { showUsageInformation, parseDeckId } from './utils.ts';
import { createTerminalInteraction } from '../terminal.ts';
import type { TerminalInteraction } from '../terminal.ts';


export async function runDeckSubcommandDelete(db: DatabaseSync, args: string[], terminal: TerminalInteraction = createTerminalInteraction()) {
  if (args.length < 1 || args.length > 2 || (args.length === 2 && args[1] !== '--yes')) return showUsageInformation();
  const id = parseDeckId(args[0]);
  const deck = getDeck(db, id);
  if (!args.includes('--yes')) {
    if (!terminal.isTTY) {
      console.error('Deletion requires confirmation in a terminal or --yes.');
      return 1;
    }
    const confirmed = await terminal.confirm(`Delete deck "${deck.name}" and its cards? [y/N] `);
    if (!confirmed) {
      console.log('Deletion cancelled.');
      return 0;
    }
  }
  deleteDeck(db, id);
  console.log(`Deleted deck ${id}.`);
  return 0;
}
