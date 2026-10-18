import type { DatabaseSync } from 'node:sqlite';
import { getDeck } from './decks.ts';

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
  const row = db.prepare('SELECT id, deck_id, front, back, created_at FROM cards WHERE id = ?').get(id) as Card | undefined;
  if (!row) throw new CardError(`Card ${id} not found.`);
  return row;
}
export function listCards(db: DatabaseSync, deckId: number, query?: string): Card[] {
  getDeck(db, deckId);
  if (query !== undefined) {
    if (!query.trim()) throw new CardError('Search query cannot be empty.');
    return db.prepare("SELECT id, deck_id, front, back, created_at FROM cards WHERE deck_id = ? AND (instr(lower(front), lower(?)) > 0 OR instr(lower(back), lower(?)) > 0) ORDER BY id").all(deckId, query, query) as unknown as Card[];
  }
  return db.prepare('SELECT id, deck_id, front, back, created_at FROM cards WHERE deck_id = ? ORDER BY id').all(deckId) as unknown as Card[];
}
export function addCard(db: DatabaseSync, deckId: number, front: string, back: string): Card {
  getDeck(db, deckId);
  const a = validateText(front, 'Front');
  const b = validateText(back, 'Back');
  const result = db.prepare('INSERT INTO cards (deck_id, front, back) VALUES (?, ?, ?)').run(deckId, a, b);
  return getCard(db, Number(result.lastInsertRowid));
}
export function editCard(db: DatabaseSync, id: number, front?: string, back?: string): Card {
  const card = getCard(db, id);
  if (front === undefined && back === undefined) throw new CardError('Specify --front and/or --back.');
  const a = front === undefined ? card.front : validateText(front, 'Front');
  const b = back === undefined ? card.back : validateText(back, 'Back');
  db.prepare('UPDATE cards SET front = ?, back = ? WHERE id = ?').run(a, b, id);
  return getCard(db, id);
}
export function deleteCard(db: DatabaseSync, id: number): void {
  getCard(db, id);
  db.prepare('DELETE FROM cards WHERE id = ?').run(id);
}
