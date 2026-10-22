import { DatabaseSync } from 'node:sqlite';
import { deleteDeck, getDeck } from '../../services/decks.ts';
import { showUsageInformation, parseDeckId } from './utils.ts';
import { parseCommandArgs } from '../utils.ts';
import { createTerminalInteraction } from '../terminal.ts';
import type { TerminalInteraction } from '../terminal.ts';


export async function runDeckSubcommandDelete(db: DatabaseSync, args: string[], terminal: TerminalInteraction = createTerminalInteraction()) {

  const parsed = parseCommandArgs(args, ['yes'], 1, 1);
  if (!parsed) return showUsageInformation();

  // TODO: rename to parseDeckIdFromInput?
  const id = parseDeckId(parsed.positionals[0]);
  const deck = getDeck(db, id);
  if (!parsed.flags.yes) {
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
  const results = deleteDeck(db, id);
  let output = "";
  (results.changes > 0) ? output = `Deleted deck ${id}.` : `Unable to delete deck ${id}`;
  console.log(output);
  return 0;
}
