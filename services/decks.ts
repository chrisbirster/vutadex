import type { DatabaseSync } from 'node:sqlite';

export interface Deck {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  card_count?: number;
}

export class DeckError extends Error {}

export function validName(name: string): string {
  const value = name.trim();
  if (!value || value.length > 120 || /[\x00-\x1f\x7f]/.test(value)) {
    throw new DeckError('Deck name must contain 1–120 characters without control characters.');
  }
  return value;
}

function ensureUnique(db: DatabaseSync, name: string, exceptId?: number): void {
  const existing = db.prepare('SELECT id FROM decks WHERE name = ? COLLATE NOCASE').get(name) as { id: number } | undefined;
  if (existing && existing.id !== exceptId) throw new DeckError('A deck with that name already exists.');
}

export function getDeck(db: DatabaseSync, id: number): Deck {
  const deck = db.prepare(`
    SELECT d.*, (SELECT COUNT(*) FROM cards c LEFT JOIN generated_cards g ON g.card_id=c.id WHERE c.deck_id=d.id AND (g.card_id IS NULL OR g.retired=0)) AS card_count
    FROM decks d WHERE d.id = ?
  `).get(id) as Deck | undefined;
  if (!deck) throw new DeckError(`Deck ${id} not found.`);
  return deck;
}

export function listDecks(db: DatabaseSync): Deck[] {
  return db.prepare(`
    SELECT d.*, (SELECT COUNT(*) FROM cards c LEFT JOIN generated_cards g ON g.card_id=c.id WHERE c.deck_id=d.id AND (g.card_id IS NULL OR g.retired=0)) AS card_count
    FROM decks d ORDER BY name COLLATE NOCASE, id
  `).all() as unknown as Deck[];
}

export function createDeck(db: DatabaseSync, name: string, description: string | null = null): Deck {
  const clean = validName(name);
  ensureUnique(db, clean);
  if (description !== null && description.length > 2000) throw new DeckError('Description must be at most 2000 characters.');
  const result = db.prepare('INSERT INTO decks (name, description) VALUES (?, ?)').run(clean, description);
  return getDeck(db, Number(result.lastInsertRowid));
}

export function renameDeck(db: DatabaseSync, id: number, name: string): Deck {
  getDeck(db, id);
  const clean = validName(name);
  ensureUnique(db, clean, id);
  db.prepare('UPDATE decks SET name = ? WHERE id = ?').run(clean, id);
  return getDeck(db, id);
}

export function describeDeck(db: DatabaseSync, id: number, description: string | null): Deck {
  getDeck(db, id);
  if (description !== null && description.length > 2000) throw new DeckError('Description must be at most 2000 characters.');
  db.prepare('UPDATE decks SET description = ? WHERE id = ?').run(description, id);
  return getDeck(db, id);
}

export function deleteDeck(db: DatabaseSync, id: number): void {
  getDeck(db, id);
  db.prepare('DELETE FROM decks WHERE id = ?').run(id);
}
