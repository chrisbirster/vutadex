import { DatabaseSync } from 'node:sqlite';
import { createInterface } from 'node:readline/promises';
import process from 'node:process';
import { deleteDeck, getDeck } from '../../services/decks.ts';
import { showUsageInformation, parseDeckId } from './utils.ts';

export async function runDeckSubcommandDelete(db: DatabaseSync, args: string[]) {
  if (args.length < 1 || args.length > 2 || (args.length === 2 && args[1] !== '--yes')) return showUsageInformation();
  const id = parseDeckId(args[0]);
  try {
    const deck = getDeck(db, id);
    if (!args.includes('--yes')) {
      if (!process.stdin.isTTY) {
        console.error('Deletion requires confirmation in a terminal or --yes.');
        return 1;
      }
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      let answer: string;
      try {
        answer = await rl.question(`Delete deck "${deck.name}" and its cards? [y/N] `);
      } finally {
        rl.close();
      }
      if (!/^(y|yes)$/i.test(answer.trim())) {
        console.log('Deletion cancelled.');
        return 0;
      }
    }
    deleteDeck(db, id);
    console.log(`Deleted deck ${id}.`);
    return 0;
  } finally {
    db.close();
  }
}

