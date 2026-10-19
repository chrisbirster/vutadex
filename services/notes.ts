import type { DatabaseSync } from 'node:sqlite';
import { getDeck } from './decks.ts';
import { generateCards, NoteError, NOTE_FIELDS } from './note-types.ts';
import type { Draft, GeneratedCard, Note, NoteType } from '../models/note.ts';
import { execute, loadQueryByFilename, queryAll, queryOne } from '../database/sql.ts';

const GET_NOTE_SQL = loadQueryByFilename('notes/get.sql');
const LIST_NOTES_SQL = loadQueryByFilename('notes/list.sql');
const GENERATED_CARDS_SQL = loadQueryByFilename('notes/generated-cards.sql');
const GENERATED_CARD_KEYS_SQL = loadQueryByFilename('notes/generated-card-keys.sql');
const RETIRE_GENERATED_CARDS_SQL = loadQueryByFilename('notes/retire-generated-cards.sql');
const REACTIVATE_GENERATED_CARD_SQL = loadQueryByFilename('notes/reactivate-generated-card.sql');
const CREATE_GENERATED_CARD_SQL = loadQueryByFilename('notes/create-generated-card.sql');
const CREATE_NOTE_SQL = loadQueryByFilename('notes/create.sql');
const UPDATE_NOTE_SQL = loadQueryByFilename('notes/update.sql');
const RETIRE_NOTE_SQL = loadQueryByFilename('notes/retire.sql');
const NOTE_FOR_CARD_SQL = loadQueryByFilename('notes/for-card.sql');
const CREATE_CARD_SQL = loadQueryByFilename('cards/create.sql');
const UPDATE_CARD_SQL = loadQueryByFilename('cards/update.sql');

type NoteRow = {
  id: number; deck_id: number; note_type: NoteType;
  fields_json: string; tags_json: string; retired: number
};

function decodeNote(row: NoteRow): Note {
  return {
    id: row.id,
    deckId: row.deck_id,
    type: row.note_type,
    fields: JSON.parse(row.fields_json) as string[],
    tags: JSON.parse(row.tags_json) as string[],
    retired: row.retired !== 0
  };
}

/** Loads a note row whether or not it is retired. */
function getNoteRow(db: DatabaseSync, noteId: number): NoteRow {
  const row = queryOne<NoteRow>(db, GET_NOTE_SQL, noteId);
  if (!row) throw new NoteError(`Note ${noteId} not found.`);
  return row;
}

/**
 * Loads one active note.
 *
 * @throws {NoteError} If the note does not exist or has been retired.
 */
export function getNote(db: DatabaseSync, noteId: number): Note {
  const note = decodeNote(getNoteRow(db, noteId));
  if (note.retired) throw new NoteError(`Note ${noteId} is retired.`);
  return note;
}

/**
 * Lists the notes in a deck.
 *
 * @throws {DeckError} If the deck does not exist.
 */
export function listNotes(db: DatabaseSync, deckId: number): Note[] {
  getDeck(db, deckId);
  return queryAll<NoteRow>(db, LIST_NOTES_SQL, deckId).map(decodeNote);
}

/**
 * Lists every card a note has generated, including retired ones.
 *
 * @throws {NoteError} If the note does not exist.
 */
export function generatedCards(db: DatabaseSync, noteId: number): GeneratedCard[] {
  getNoteRow(db, noteId);
  return queryAll<{ cardId: number; key: string; retired: number }>(db, GENERATED_CARDS_SQL, noteId)
    .map(row => ({ cardId: row.cardId, key: row.key, retired: row.retired !== 0 }));
}

/**
 * Checks that `fields` produce valid cards for this note type.
 *
 * @throws {NoteError} If the type is unknown or the fields are invalid.
 */
function validateNoteFields(type: NoteType, fields: readonly string[]): Draft[] {
  if (!NOTE_FIELDS[type]) throw new NoteError('Invalid note type.');
  // The caller generates again after the note has an allocated stable ID.
  return generateCards(1, type, fields);
}

/**
 * Brings a note's cards in line with freshly generated drafts, and returns the active card IDs.
 *
 * Drafts whose key already has a card update (and reactivate) that card, so its ID and review
 * history survive; new keys create cards; keys no longer generated stay retired.
 */
function syncGeneratedCards(db: DatabaseSync, noteId: number, deckId: number, drafts: readonly Draft[]): number[] {
  const rows = queryAll<{ card_id: number; generation_key: string }>(db, GENERATED_CARD_KEYS_SQL, noteId);
  const existingCardIds = new Map(rows.map(row => [row.generation_key, row.card_id]));
  execute(db, RETIRE_GENERATED_CARDS_SQL, noteId);
  const cardIds: number[] = [];
  for (const draft of drafts) {
    const existingCardId = existingCardIds.get(draft.key);
    if (existingCardId !== undefined) {
      execute(db, UPDATE_CARD_SQL, draft.front, draft.back, existingCardId);
      execute(db, REACTIVATE_GENERATED_CARD_SQL, existingCardId);
      cardIds.push(existingCardId);
    } else {
      const newCardResult = execute(db, CREATE_CARD_SQL, deckId, draft.front, draft.back);
      const newCardId = Number(newCardResult.lastInsertRowid);
      execute(db, CREATE_GENERATED_CARD_SQL, newCardId, noteId, draft.key);
      cardIds.push(newCardId);
    }
  }
  return cardIds;
}

/**
 * Creates a note and its generated cards in one transaction.
 *
 * @param fields - Field values in the order given by NOTE_FIELDS for `type`.
 * @returns The stored note and the IDs of the cards it generated.
 * @throws {NoteError} If the type, fields or tags are invalid.
 * @throws {DeckError} If the deck does not exist.
 */
export function createNote(
  db: DatabaseSync, deckId: number, type: NoteType, fields: readonly string[], tags: string[] = []
): { note: Note; cardIds: number[] } {
  getDeck(db, deckId);
  validateNoteFields(type, fields);
  if (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string' || tag.length > 100)) {
    throw new NoteError('Invalid note tags.');
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    const newNoteResult = execute(db, CREATE_NOTE_SQL, deckId, type, JSON.stringify(fields), JSON.stringify(tags));
    const noteId = Number(newNoteResult.lastInsertRowid);
    const cardIds = syncGeneratedCards(db, noteId, deckId, generateCards(noteId, type, fields));
    db.exec('COMMIT');
    return { note: getNote(db, noteId), cardIds };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/**
 * Replaces a note's fields and regenerates its cards without resetting their FSRS history.
 *
 * @throws {NoteError} If the note does not exist, is retired, or the fields are invalid.
 */
export function updateNote(
  db: DatabaseSync, noteId: number, fields: readonly string[]
): { note: Note; cardIds: number[] } {
  const current = getNote(db, noteId);
  validateNoteFields(current.type, fields);
  db.exec('BEGIN IMMEDIATE');
  try {
    const cardIds = syncGeneratedCards(db, noteId, current.deckId, generateCards(noteId, current.type, fields));
    execute(db, UPDATE_NOTE_SQL, JSON.stringify(fields), noteId);
    db.exec('COMMIT');
    return { note: getNote(db, noteId), cardIds };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/**
 * Retires a note and its generated cards. Soft retirement deliberately preserves
 * generated card IDs and review history.
 *
 * @throws {NoteError} If the note does not exist or is already retired.
 */
export function retireNote(db: DatabaseSync, noteId: number): void {
  getNote(db, noteId);
  db.exec('BEGIN IMMEDIATE');
  try {
    execute(db, RETIRE_NOTE_SQL, noteId);
    execute(db, RETIRE_GENERATED_CARDS_SQL, noteId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** Finds the note a card was generated from, or `null` for a manually created card. */
export function noteForCard(db: DatabaseSync, cardId: number): (Note & { generationKey: string }) | null {
  const row = queryOne<NoteRow & { generation_key: string }>(db, NOTE_FOR_CARD_SQL, cardId);
  return row ? { ...decodeNote(row), generationKey: row.generation_key } : null;
}
