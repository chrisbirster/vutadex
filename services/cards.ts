import type { DatabaseSync } from 'node:sqlite';
import { getDeck } from './decks.ts';
import { loadQuery } from '../database/sql.ts';

const GET_CARD_SQL = loadQuery('cards/get.sql');
const LIST_CARDS_SQL = loadQuery('cards/list.sql');
const IS_GENERATED_CARD_SQL = loadQuery('cards/is-generated.sql');
const CREATE_CARD_SQL = loadQuery('cards/create.sql');
const UPDATE_CARD_SQL = loadQuery('cards/update.sql');
const DELETE_CARD_SQL = loadQuery('cards/delete.sql');

export interface Card {
  id: number;
  deck_id: number;
  front: string;
  back: string;
  created_at: string;
}
export class CardError extends Error {}

export function parsePositiveId(value: string | undefined): number {
  if (!value || !/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new CardError('Expected a positive integer ID.');
  }
  return Number(value);
}
function validateText(text: string, label: string): string {
  const clean = text.trim();
  if (!clean || clean.length > 10000 || clean.includes('\0')) {
    throw new CardError(`${label} must be 1–10000 characters, excluding NUL.`);
  }
  return clean;
}
export function getCard(db: DatabaseSync, id: number): Card {
  const row = db.prepare(GET_CARD_SQL).get(id) as Card | undefined;
  if (!row) throw new CardError(`Card ${id} not found.`);
  return row;
}
export function listCards(db: DatabaseSync, deckId: number, query?: string): Card[] {
  getDeck(db, deckId);
  if (query !== undefined && !query.trim()) throw new CardError('Search query cannot be empty.');
  return db.prepare(LIST_CARDS_SQL).all(deckId, query ?? null, query ?? null, query ?? null) as unknown as Card[];
}
function ensureManualCard(db: DatabaseSync, id: number): void {
  if (db.prepare(IS_GENERATED_CARD_SQL).get(id))
    throw new CardError('Generated cards must be edited or retired through their source note.');
}
export function addCard(db: DatabaseSync, deckId: number, front: string, back: string): Card {
  getDeck(db, deckId);
  const a = validateText(front, 'Front');
  const b = validateText(back, 'Back');
  const result = db.prepare(CREATE_CARD_SQL).run(deckId, a, b);
  return getCard(db, Number(result.lastInsertRowid));
}
export function editCard(db: DatabaseSync, id: number, front?: string, back?: string): Card {
  const card = getCard(db, id);
  ensureManualCard(db, id);
  if (front === undefined && back === undefined) throw new CardError('Specify --front and/or --back.');
  const a = front === undefined ? card.front : validateText(front, 'Front');
  const b = back === undefined ? card.back : validateText(back, 'Back');
  db.prepare(UPDATE_CARD_SQL).run(a, b, id);
  return getCard(db, id);
}
export function deleteCard(db: DatabaseSync, id: number): void {
  getCard(db, id);
  ensureManualCard(db, id);
  db.prepare(DELETE_CARD_SQL).run(id);
}
