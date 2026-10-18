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
  if (query !== undefined && !query.trim()) throw new CardError('Search query cannot be empty.');
  const sql = `
    SELECT c.id,c.deck_id,c.front,c.back,c.created_at FROM cards c
    LEFT JOIN generated_cards g ON g.card_id=c.id
    WHERE c.deck_id=? AND (g.card_id IS NULL OR g.retired=0)
  `+(query===undefined?'':` AND (instr(lower(c.front), lower(?))>0 OR instr(lower(c.back), lower(?))>0)`)
    +' ORDER BY c.id';
  return db.prepare(sql).all(...(query===undefined?[deckId]:[deckId,query,query])) as unknown as Card[];
}
function ensureManualCard(db: DatabaseSync, id: number): void {
  if (db.prepare('SELECT 1 FROM generated_cards WHERE card_id=?').get(id))
    throw new CardError('Generated cards must be edited or retired through their source note.');
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
  ensureManualCard(db, id);
  if (front === undefined && back === undefined) throw new CardError('Specify --front and/or --back.');
  const a = front === undefined ? card.front : validateText(front, 'Front');
  const b = back === undefined ? card.back : validateText(back, 'Back');
  db.prepare('UPDATE cards SET front = ?, back = ? WHERE id = ?').run(a, b, id);
  return getCard(db, id);
}
export function deleteCard(db: DatabaseSync, id: number): void {
  getCard(db, id);
  ensureManualCard(db, id);
  db.prepare('DELETE FROM cards WHERE id = ?').run(id);
}
