import type { DatabaseSync } from 'node:sqlite';
import { loadQueryByFilename, execute } from '../database/sql.ts';
import { validateDeckName } from './decks.ts';
import { generateCards, NOTE_FIELDS } from './note-types.ts';
import type { NoteType } from '../models/note.ts';
import { DeckFileError } from './deck-file.ts';

const CREATE_DECK_SQL = loadQueryByFilename('decks/create.sql');
const CREATE_NOTE_SQL = loadQueryByFilename('notes/create.sql');
const CREATE_CARD_SQL = loadQueryByFilename('cards/create.sql');
const CREATE_GENERATED_SQL = loadQueryByFilename('notes/create-generated-card.sql');
const MAX_FILE_CHARS = 64 * 1024 * 1024;
const MAX_NOTES = 10_000;
type ParsedNote = { type: NoteType; fields: string[]; tags: string[] };
type ParsedDeck = { name: string; notes: ParsedNote[] };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DeckFileError('Each .deck record must be a JSON object.');
  }
  return value as Record<string, unknown>;
}
function exactKeys(row: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(row).some(key => !keys.includes(key)) || keys.some(key => !(key in row))) {
    throw new DeckFileError('Unexpected or missing fields in .deck record.');
  }
}

/** Fully validates content before touching the SQLite database. */
export function parseDeckFile(content: string): ParsedDeck {
  if (content.length > MAX_FILE_CHARS) throw new DeckFileError('Deck file exceeds 64 MiB.');
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  if (!lines.length || lines.length > MAX_NOTES + 1) {
    throw new DeckFileError('Deck file must contain a header and at most 10000 notes.');
  }
  const parseLine = (line: string): Record<string, unknown> => {
    try { return object(JSON.parse(line) as unknown); }
    catch (error) {
      if (error instanceof DeckFileError) throw error;
      throw new DeckFileError('Malformed .deck JSON record.');
    }
  };
  const header = parseLine(lines[0]!);
  exactKeys(header, ['kind', 'format', 'version', 'name']);
  if (header.kind !== 'deck' || header.format !== 'plandalf.deck' || header.version !== 2 ||
      typeof header.name !== 'string') {
    throw new DeckFileError('Expected Plandalf deck format version 2.');
  }
  const name = validateDeckName(header.name);
  const notes: ParsedNote[] = [];
  for (const line of lines.slice(1)) {
    const row = parseLine(line);
    exactKeys(row, ['kind', 'note_type', 'fields', 'tags_json']);
    if (row.kind !== 'note' || typeof row.note_type !== 'string' ||
        !Object.prototype.hasOwnProperty.call(NOTE_FIELDS, row.note_type)) {
      throw new DeckFileError('Unsupported note record or note type.');
    }
    const type = row.note_type as NoteType;
    if (!Array.isArray(row.fields) || !row.fields.every(f => typeof f === 'string')) {
      throw new DeckFileError('Note fields must be an array of strings.');
    }
    const fields = row.fields as string[];
    if (typeof row.tags_json !== 'string') throw new DeckFileError('Invalid note tags.');
    let tags: unknown;
    try { tags = JSON.parse(row.tags_json) as unknown; }
    catch { throw new DeckFileError('Invalid JSON note tags.'); }
    if (!Array.isArray(tags) || tags.some(t => typeof t !== 'string' || t.length > 100)) {
      throw new DeckFileError('Invalid note tags.');
    }
    generateCards(1, type, fields);
    // Media is separate from the content-only format and cannot be silently lost.
    if (type === 'image-occlusion') {
      throw new DeckFileError('Image-occlusion import requires media portability (M6.3).');
    }
    notes.push({ type, fields, tags: tags as string[] });
  }
  return {name, notes};
}

/**
 * Atomically imports a new deck and all its generated cards with fresh FSRS state.
 * Unlike createNote(), this builds cards within one outer transaction.
 */
export function importDeckFile(db: DatabaseSync, content: string): { deckId: number; notes: number } {
  const parsed = parseDeckFile(content);
  if (db.isTransaction) throw new DeckFileError('Import requires a standalone transaction.');
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = execute(db, CREATE_DECK_SQL, parsed.name, null);
    const deckId = Number(result.lastInsertRowid);
    for (const note of parsed.notes) {
      const row = execute(db, CREATE_NOTE_SQL, deckId, note.type,
        JSON.stringify(note.fields), JSON.stringify(note.tags));
      const noteId = Number(row.lastInsertRowid);
      for (const draft of generateCards(noteId, note.type, note.fields)) {
        const card = execute(db, CREATE_CARD_SQL, deckId, draft.front, draft.back);
        execute(db, CREATE_GENERATED_SQL, Number(card.lastInsertRowid), noteId, draft.key);
      }
    }
    db.exec('COMMIT');
    return {deckId, notes:parsed.notes.length};
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
