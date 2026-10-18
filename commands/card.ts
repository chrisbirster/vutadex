import { createInterface } from 'node:readline/promises';
import process from 'node:process';
import { getDatabase } from '../database/index.ts';
import { getDeck, DeckError } from '../services/decks.ts';
import { CardError, parsePositiveId, addCard, editCard, getCard, listCards, deleteCard } from '../services/cards.ts';

function usage(): number {
  console.error('Usage: card add <deck-id> [--front <text> --back <text>] | list <deck-id> [--search <query>] | search <deck-id> <query> | show <card-id> | edit <card-id> [--front <text>] [--back <text>] | delete <card-id> [--yes]');
  return 1;
}
function fields(args: string[]): { front?: string; back?: string } | null {
  const result: { front?: string; back?: string } = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if ((flag !== '--front' && flag !== '--back') || value === undefined || flag.slice(2) in result) return null;
    result[flag.slice(2) as 'front' | 'back'] = value;
  }
  return result;
}
async function interactiveFields(existing?: { front: string; back: string }): Promise<{ front: string; back: string }> {
  if (!process.stdin.isTTY) throw new CardError('Interactive entry requires a terminal; pass --front and --back.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const front = await rl.question('Front (use \\n for newlines): ');
    const back = await rl.question('Back (use \\n for newlines): ');
    return {
      front: (front || existing?.front || '').replace(/\\n/g, '\n'),
      back: (back || existing?.back || '').replace(/\\n/g, '\n')
    };
  } finally {
    rl.close();
  }
}
export async function runCardCommand(subcommand: string | undefined, args: string[]): Promise<number> {
  if (!subcommand) return usage();
  try {
    if (subcommand === 'add' || subcommand === 'edit') {
      if (!args.length) return usage();
      const id = parsePositiveId(args[0]);
      const opts = fields(args.slice(1));
      if (!opts) return usage();
      const values = subcommand === 'add' && opts.front === undefined && opts.back === undefined
        ? await interactiveFields()
        : opts;
      const db = getDatabase();
      try {
        if (subcommand === 'add') {
          if (values.front === undefined || values.back === undefined) return usage();
          getDeck(db, id);
          const card = addCard(db, id, values.front, values.back);
          console.log(`Created card ${card.id} in deck ${card.deck_id}.`);
        } else {
          const updated = editCard(db, id, values.front, values.back);
          console.log(`Updated card ${updated.id}.`);
        }
        return 0;
      } finally { db.close(); }
    }
    if (subcommand === 'delete') {
      if (args.length < 1 || args.length > 2 || (args.length === 2 && args[1] !== '--yes')) return usage();
      const id = parsePositiveId(args[0]);
      const db = getDatabase();
      try {
        const card = getCard(db, id);
        if (args[1] !== '--yes') {
          if (!process.stdin.isTTY) throw new CardError('Deletion requires terminal confirmation or --yes.');
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          let answer: string;
          try { answer = await rl.question(`Delete card ${card.id}? [y/N] `); }
          finally { rl.close(); }
          if (!/^(yes|y)$/i.test(answer.trim())) {
            console.log('Deletion cancelled.');
            return 0;
          }
        }
        deleteCard(db, id);
        console.log(`Deleted card ${id}.`);
        return 0;
      } finally { db.close(); }
    }
    const db = getDatabase();
    try {
      if (subcommand === 'show') {
        if (args.length !== 1) return usage();
        console.table(getCard(db, parsePositiveId(args[0])));
        return 0;
      }
      if (subcommand === 'list' || subcommand === 'search') {
        if (!args.length) return usage();
        const id = parsePositiveId(args[0]);
        let query: string | undefined;
        if (subcommand === 'search') {
          if (args.length < 2) return usage();
          query = args.slice(1).join(' ');
        } else if (args.length) {
          if (args.length === 3 && args[1] === '--search') query = args[2];
          else if (args.length !== 1) return usage();
        }
        console.table(listCards(db, id, query));
        return 0;
      }
      return usage();
    } finally { db.close(); }
  } catch (error) {
    if (error instanceof CardError || error instanceof DeckError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}
