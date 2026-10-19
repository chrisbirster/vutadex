import { createInterface } from 'node:readline/promises';
import process from 'node:process';
import { getDatabase } from '../database/index.ts';
import { CardError } from '../services/cards.ts';
import { POSITIVE_INTEGER_PATTERN } from '../constants.ts';
import { parseDeckId } from './deck/utils.ts';
import { DeckError } from '../services/decks.ts';
import { createNote, updateNote, getNote, listNotes, generatedCards, retireNote } from '../services/notes.ts';
import { NOTE_FIELDS, parseNoteType, NoteError } from '../services/note-types.ts';

function usage(): number {
  console.error('Usage: note types | note add <deck-id> <type> <fields...> | note list <deck-id> | note show <note-id> | note edit <note-id> <fields...> | note delete <note-id> [--yes]');
  return 1;
}
function parseNoteId(raw: string | undefined): number {
  const id = Number(raw);
  if (!raw || !POSITIVE_INTEGER_PATTERN.test(raw) || !Number.isSafeInteger(id)) {
    throw new NoteError('Expected a positive integer note ID.');
  }
  return id;
}
export async function runNoteCommand(args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  if (!sub) return usage();
  try {
    if (sub === 'types') {
      if (rest.length) return usage();
      console.table(Object.entries(NOTE_FIELDS).map(([type, fields]) => ({ type, fields: fields.join(', ') })));
      return 0;
    }
    const db = getDatabase();
    try {
      switch (sub) {
        case 'add': {
          if (rest.length < 3) return usage();
          const deckId = parseDeckId(rest[0]);
          const type = parseNoteType(rest[1]!);
          const fields = rest.slice(2);
          const value = createNote(db, deckId, type, fields);
          console.log('Created ' + type + ' note ' + value.note.id + ' with cards: ' + value.cardIds.join(', '));
          return 0;
        }
        case 'list': {
          if (rest.length !== 1) return usage();
          console.table(listNotes(db, parseDeckId(rest[0])).map(note => ({
            id: note.id, type: note.type, first: note.fields[0], cards: generatedCards(db, note.id).filter(x => !x.retired).length
          })));
          return 0;
        }
        case 'show': {
          if (rest.length !== 1) return usage();
          const note = getNote(db, parseNoteId(rest[0]));
          console.log('Note ' + note.id + ' (' + note.type + ')');
          console.table(NOTE_FIELDS[note.type].map((name, i) => ({ field: name, value: note.fields[i] })));
          console.table(generatedCards(db, note.id));
          return 0;
        }
        case 'edit': {
          if (rest.length < 2) return usage();
          const value = updateNote(db, parseNoteId(rest[0]), rest.slice(1));
          console.log('Updated note ' + value.note.id + '; active cards: ' + value.cardIds.join(', '));
          return 0;
        }
        case 'delete': {
          if (rest.length < 1 || rest.length > 2 || (rest.length === 2 && rest[1] !== '--yes')) return usage();
          const id = parseNoteId(rest[0]);
          const note = getNote(db, id);
          if (rest[1] !== '--yes') {
            if (!process.stdin.isTTY) throw new NoteError('Deletion requires confirmation in a terminal or --yes.');
            const rl = createInterface({ input: process.stdin, output: process.stdout });
            let answer: string;
            try { answer = await rl.question('Retire ' + note.type + ' note ' + id + ' and its generated cards? [y/N] '); }
            finally { rl.close(); }
            if (!/^(y|yes)$/i.test(answer.trim())) { console.log('Deletion cancelled.'); return 0; }
          }
          retireNote(db, id);
          console.log('Retired note ' + id + '; existing FSRS history preserved.');
          return 0;
        }
        default: return usage();
      }
    } finally { db.close(); }
  } catch (error) {
    if (error instanceof NoteError || error instanceof CardError || error instanceof DeckError) {
      console.error(error.message); return 1;
    }
    throw error;
  }
}
