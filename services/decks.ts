import type { DatabaseSync } from 'node:sqlite';
import { loadQuery } from '../database/sql.ts';

const GET_DECK_SQL = loadQuery('decks/get.sql');
const LIST_DECKS_SQL = loadQuery('decks/list.sql');
const FIND_DECK_BY_NAME_SQL = loadQuery('decks/find-by-name.sql');
const CREATE_DECK_SQL = loadQuery('decks/create.sql');
const RENAME_DECK_SQL = loadQuery('decks/rename.sql');
const DESCRIBE_DECK_SQL = loadQuery('decks/describe.sql');
const DELETE_DECK_SQL = loadQuery('decks/delete.sql');

export interface Deck {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  card_count?: number;
}

export class DeckError extends Error { }

export function validName(name: string): string {
  const value = name.trim();
  if (!value || value.length > 120 || /[\x00-\x1f\x7f]/.test(value)) {
    throw new DeckError('Deck name must contain 1–120 characters without control characters.');
  }
  return value;
}

function ensureUnique(db: DatabaseSync, name: string, exceptId?: number): void {
  const existing = db.prepare(FIND_DECK_BY_NAME_SQL).get(name) as { id: number } | undefined;
  if (existing && existing.id !== exceptId) throw new DeckError('A deck with that name already exists.');
}

export function getDeck(db: DatabaseSync, id: number): Deck {
  const deck = db.prepare(GET_DECK_SQL).get(id) as Deck | undefined;
  if (!deck) throw new DeckError(`Deck ${id} not found.`);
  return deck;
}

export function listDecks(db: DatabaseSync): Deck[] {
  return db.prepare(LIST_DECKS_SQL).all() as unknown as Deck[];
}

export function createDeck(db: DatabaseSync, name: string, description: string | null = null): Deck {
  const clean = validName(name);
  ensureUnique(db, clean);
  if (description !== null && description.length > 2000) throw new DeckError('Description must be at most 2000 characters.');
  const result = db.prepare(CREATE_DECK_SQL).run(clean, description);
  return getDeck(db, Number(result.lastInsertRowid));
}

export function renameDeck(db: DatabaseSync, id: number, name: string): Deck {
  getDeck(db, id);
  const clean = validName(name);
  ensureUnique(db, clean, id);
  db.prepare(RENAME_DECK_SQL).run(clean, id);
  return getDeck(db, id);
}

export function describeDeck(db: DatabaseSync, id: number, description: string | null): Deck {
  getDeck(db, id);
  if (description !== null && description.length > 2000) throw new DeckError('Description must be at most 2000 characters.');
  db.prepare(DESCRIBE_DECK_SQL).run(description, id);
  return getDeck(db, id);
}

export function deleteDeck(db: DatabaseSync, id: number): void {
  getDeck(db, id);
  db.prepare(DELETE_DECK_SQL).run(id);
}
