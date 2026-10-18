import { createInterface } from 'node:readline/promises';
import process from 'node:process';
import { getDatabase } from '../database/index.ts';
import { DeckError, createDeck, deleteDeck, describeDeck, getDeck, listDecks, renameDeck } from '../services/decks.ts';

function parseId(raw: string | undefined): number {
  if (!raw || !/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new DeckError('Expected a positive integer deck ID.');
  }
  return Number(raw);
}

function usage(): number {
  console.error('Usage: deck list | create <name> [--description <text>] | show <id> | rename <id> <name> | describe <id> <text|--clear> | delete <id> [--yes]');
  return 1;
}

export async function runDeckCommand(subcommand: string | undefined, args: string[]): Promise<number> {
  if (!subcommand) return usage();
  try {
    if (subcommand === 'delete') {
      if (args.length < 1 || args.length > 2 || (args.length === 2 && args[1] !== '--yes')) return usage();
      const id = parseId(args[0]);
      const db = getDatabase();
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

    const db = getDatabase();
    try {
      switch (subcommand) {
        case 'list':
          if (args.length) return usage();
          console.table(listDecks(db));
          return 0;
        case 'create': {
          const flag = args.indexOf('--description');
          if (flag >= 0 && (flag !== args.length - 2 || !args[flag + 1])) return usage();
          const nameArgs = flag >= 0 ? args.slice(0, flag) : args;
          if (!nameArgs.length) return usage();
          const deck = createDeck(db, nameArgs.join(' '), flag >= 0 ? args[flag + 1] ?? '' : null);
          console.log(`Created deck "${deck.name}" (ID: ${deck.id})`);
          return 0;
        }
        case 'show': {
          if (args.length !== 1) return usage();
          console.table(getDeck(db, parseId(args[0])));
          return 0;
        }
        case 'rename': {
          if (args.length < 2) return usage();
          const deck = renameDeck(db, parseId(args[0]), args.slice(1).join(' '));
          console.log(`Renamed deck ${deck.id} to "${deck.name}".`);
          return 0;
        }
        case 'describe': {
          if (args.length < 2) return usage();
          if (args[1] === '--clear' && args.length !== 2) return usage();
          const deck = describeDeck(db, parseId(args[0]), args[1] === '--clear' ? null : args.slice(1).join(' '));
          console.log(`Updated description for deck ${deck.id}.`);
          return 0;
        }
        default:
          return usage();
      }
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof DeckError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}
