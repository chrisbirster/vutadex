import type { DatabaseSync } from 'node:sqlite';
import { execute, loadQueryByFilename, queryAll, queryOne } from '../database/sql.ts';
import { MAX_DECK_NAME_LENGTH, MAX_DESCRIPTION_LENGTH } from '../constants.ts';
import type { Deck, DeckIdRow } from '../models/deck.ts';

const GET_DECK_SQL = loadQueryByFilename('decks/get.sql');
const LIST_DECKS_SQL = loadQueryByFilename('decks/list.sql');
const FIND_DECK_BY_NAME_SQL = loadQueryByFilename('decks/find-by-name.sql');
const CREATE_DECK_SQL = loadQueryByFilename('decks/create.sql');
const RENAME_DECK_SQL = loadQueryByFilename('decks/rename.sql');
const DESCRIBE_DECK_SQL = loadQueryByFilename('decks/describe.sql');
const DELETE_DECK_SQL = loadQueryByFilename('decks/delete.sql');

export class DeckError extends Error { }

/**
 * Whether `text` contains an ASCII control character.
 *
 * Matches C0 controls (U+0000–U+001F, e.g. NUL, tab, newline) and DEL (U+007F).
 * Does not match C1 controls (U+0080–U+009F) or invisible Unicode such as
 * zero-width spaces.
 */
function hasControlCharacters(text: string): boolean {
  return /[\x00-\x1f\x7f]/.test(text);
}

/**
 * Trims and validates a user-supplied deck name.
 *
 * @param userInputName - Raw name as typed by the user.
 * @returns The trimmed name, safe to store.
 * @throws {DeckError} If the trimmed name is empty, longer than MAX_DECK_NAME_LENGTH characters,
 *   or contains control characters.
 * @example
 * validateDeckName('  Spanish  '); // 'Spanish'
 * validateDeckName('a\nb');        // throws DeckError
 */
export function validateDeckName(userInputName: string): string {
  const trimmedUserInputName = userInputName.trim();
  if (!trimmedUserInputName || trimmedUserInputName.length > MAX_DECK_NAME_LENGTH || hasControlCharacters(trimmedUserInputName)) {
    throw new DeckError(`Deck name must contain 1–${MAX_DECK_NAME_LENGTH} characters without control characters.`);
  }
  return trimmedUserInputName;
}

/**
 * Trims a deck description and checks its length.
 *
 * @returns The trimmed text, or `null` if the input was `null` or blank.
 * @throws {DeckError} If the trimmed text is longer than MAX_DESCRIPTION_LENGTH.
 */
export function validateDeckDescription(userInputDescription: string | null): string | null {
  const trimmedDescription = userInputDescription?.trim();
  if (!trimmedDescription) return null;
  if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
    throw new DeckError(`Description must be at most ${MAX_DESCRIPTION_LENGTH} characters.`);
  }
  return trimmedDescription;
}

/**
 * Throws if another deck already uses this name (case-insensitive).
 *
 * @param deckNameWanted - the new name of the Deck
 * @param excludeDeckId - Deck to ignore in the check, so a deck can be renamed
 *   to its own name or a case variant of it. Omit when creating.
 * @throws {DeckError} If the name belongs to a different deck.
 */
function ensureDeckNameUnique(db: DatabaseSync, deckNameWanted: string, excludeDeckId?: number): void {
  const isDeckNameTaken = queryOne<DeckIdRow>(db, FIND_DECK_BY_NAME_SQL, deckNameWanted);
  if (isDeckNameTaken && isDeckNameTaken.id !== excludeDeckId) throw new DeckError('A deck with that name already exists.');
}

/**
 * Loads one deck, including its live `card_count`.
 *
 * @throws {DeckError} If no deck has this ID.
 */
export function getDeck(db: DatabaseSync, deckId: number): Deck {
  const deck = queryOne<Deck>(db, GET_DECK_SQL, deckId);
  if (!deck) throw new DeckError(`Deck ${deckId} not found.`);
  return deck;
}

/** Lists all decks with their `card_count`, ordered by name (case-insensitive), then ID. */
export function listDecks(db: DatabaseSync): Deck[] {
  return queryAll<Deck>(db, LIST_DECKS_SQL);
}

/**
 * Creates a deck and returns it as stored.
 *
 * @param userInputName - Raw name; trimmed and validated by {@link validateDeckName}.
 * @param userInputDescription - Optional description of at most MAX_DESCRIPTION_LENGTH characters.
 * @throws {DeckError} If the name is invalid or already taken, or the description is too long.
 */
export function createDeck(db: DatabaseSync, userInputName: string, userInputDescription: string | null = null): Deck {
  const cleanedDeckName = validateDeckName(userInputName);
  const cleanedDeckDescription = validateDeckDescription(userInputDescription);
  ensureDeckNameUnique(db, cleanedDeckName);
  const newDeckResult = execute(db, CREATE_DECK_SQL, cleanedDeckName, cleanedDeckDescription);
  return getDeck(db, Number(newDeckResult.lastInsertRowid));
}

/**
 * Renames a deck and returns it as stored. Renaming a deck to its own name,
 * or to a different letter case of it, is allowed.
 *
 * @throws {DeckError} If the name is invalid, belongs to another deck, or the deck does not exist.
 */
export function renameDeck(db: DatabaseSync, userInputDeckId: number, deckNameWanted: string): Deck {
  const cleanedDeckName = validateDeckName(deckNameWanted);
  ensureDeckNameUnique(db, cleanedDeckName, userInputDeckId);
  execute(db, RENAME_DECK_SQL, cleanedDeckName, userInputDeckId);
  return getDeck(db, userInputDeckId);
}

/**
 * Sets or clears a deck's description and returns the updated deck.
 *
 * @param description - New text of at most MAX_DESCRIPTION_LENGTH characters, or `null` to clear it.
 * @throws {DeckError} If the description is too long or the deck does not exist.
 */
export function describeDeck(db: DatabaseSync, deckId: number, description: string | null): Deck {
  const cleanedDescription = validateDeckDescription(description);
  getDeck(db, deckId); // existence check; the UPDATE below would silently match nothing
  execute(db, DESCRIBE_DECK_SQL, cleanedDescription, deckId);
  return getDeck(db, deckId);
}

/**
 * Deletes a deck.
 *
 * Also deletes the deck's cards (`ON DELETE CASCADE`), so callers should confirm first.
 *
 * @throws {DeckError} If the deck does not exist.
 */
export function deleteDeck(db: DatabaseSync, deckId: number): void {
  getDeck(db, deckId); // existence check; the DELETE below would silently match nothing
  execute(db, DELETE_DECK_SQL, deckId);
}
