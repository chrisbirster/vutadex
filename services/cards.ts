import type { DatabaseSync } from 'node:sqlite';
import { getDeck } from './decks.ts';
import { execute, loadQuery, queryAll, queryOne } from '../database/sql.ts';
import { MAX_TEXT_LENGTH, POSITIVE_INTEGER_PATTERN } from '../constants.ts';
import type { Card } from '../models/card.ts';

const GET_CARD_SQL = loadQuery('cards/get.sql');
const LIST_CARDS_SQL = loadQuery('cards/list.sql');
const IS_GENERATED_CARD_SQL = loadQuery('cards/is-generated.sql');
const CREATE_CARD_SQL = loadQuery('cards/create.sql');
const UPDATE_CARD_SQL = loadQuery('cards/update.sql');
const DELETE_CARD_SQL = loadQuery('cards/delete.sql');

export class CardError extends Error {}

export function parsePositiveId(value: string | undefined): number {
  if (!value || !POSITIVE_INTEGER_PATTERN.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new CardError('Expected a positive integer ID.');
  }
  return Number(value);
}
function validateText(text: string, label: string): string {
  const clean = text.trim();
  if (!clean || clean.length > MAX_TEXT_LENGTH || clean.includes('\0')) {
    throw new CardError(`${label} must be 1–${MAX_TEXT_LENGTH} characters, excluding NUL.`);
  }
  return clean;
}
export function getCard(db: DatabaseSync, id: number): Card {
  const row = queryOne<Card>(db, GET_CARD_SQL, id);
  if (!row) throw new CardError(`Card ${id} not found.`);
  return row;
}
export function listCards(db: DatabaseSync, deckId: number, query?: string): Card[] {
  getDeck(db, deckId);
  if (query !== undefined && !query.trim()) throw new CardError('Search query cannot be empty.');
  return queryAll<Card>(db, LIST_CARDS_SQL, deckId, query ?? null, query ?? null, query ?? null);
}
function ensureManualCard(db: DatabaseSync, id: number): void {
  if (queryOne(db, IS_GENERATED_CARD_SQL, id))
    throw new CardError('Generated cards must be edited or retired through their source note.');
}
export function addCard(db: DatabaseSync, deckId: number, front: string, back: string): Card {
  getDeck(db, deckId);
  const a = validateText(front, 'Front');
  const b = validateText(back, 'Back');
  const result = execute(db, CREATE_CARD_SQL, deckId, a, b);
  return getCard(db, Number(result.lastInsertRowid));
}
export function editCard(db: DatabaseSync, id: number, front?: string, back?: string): Card {
  const card = getCard(db, id);
  ensureManualCard(db, id);
  if (front === undefined && back === undefined) throw new CardError('Specify --front and/or --back.');
  const a = front === undefined ? card.front : validateText(front, 'Front');
  const b = back === undefined ? card.back : validateText(back, 'Back');
  execute(db, UPDATE_CARD_SQL, a, b, id);
  return getCard(db, id);
}
export function deleteCard(db: DatabaseSync, id: number): void {
  getCard(db, id);
  ensureManualCard(db, id);
  execute(db, DELETE_CARD_SQL, id);
}
