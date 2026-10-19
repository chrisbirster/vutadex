import type { DatabaseSync } from 'node:sqlite';
import { getDeck } from './decks.ts';
import { execute, loadQueryByFilename, queryAll, queryOne } from '../database/sql.ts';
import { MAX_TEXT_LENGTH } from '../constants.ts';
import type { Card } from '../models/card.ts';

const GET_CARD_SQL = loadQueryByFilename('cards/get.sql');
const LIST_CARDS_SQL = loadQueryByFilename('cards/list.sql');
const IS_GENERATED_CARD_SQL = loadQueryByFilename('cards/is-generated.sql');
const CREATE_CARD_SQL = loadQueryByFilename('cards/create.sql');
const UPDATE_CARD_SQL = loadQueryByFilename('cards/update.sql');
const DELETE_CARD_SQL = loadQueryByFilename('cards/delete.sql');

export class CardError extends Error { }

/**
 * Trims and validates one side of a card.
 *
 * @param userInputText - Raw text as typed by the user.
 * @param label - Name of the side ("Front" or "Back"), used in the error message.
 * @returns The trimmed text, safe to store.
 * @throws {CardError} If the trimmed text is empty, longer than MAX_TEXT_LENGTH characters,
 *   or contains a NUL character.
 */
export function validateCardText(userInputText: string, label: string): string {
  const trimmedText = userInputText.trim();
  if (!trimmedText || trimmedText.length > MAX_TEXT_LENGTH || trimmedText.includes('\0')) {
    throw new CardError(`${label} must be 1–${MAX_TEXT_LENGTH} characters, excluding NUL.`);
  }
  return trimmedText;
}

/**
 * Throws if the card was generated from a note. Those cards are owned by their
 * note, so they can only change through it.
 *
 * @throws {CardError} If the card is generated.
 */
function ensureCardIsManual(db: DatabaseSync, cardId: number): void {
  if (queryOne(db, IS_GENERATED_CARD_SQL, cardId)) {
    throw new CardError('Generated cards must be edited or retired through their source note.');
  }
}

/**
 * Loads one card.
 *
 * @throws {CardError} If no card has this ID.
 */
export function getCard(db: DatabaseSync, cardId: number): Card {
  const card = queryOne<Card>(db, GET_CARD_SQL, cardId);
  if (!card) throw new CardError(`Card ${cardId} not found.`);
  return card;
}

/**
 * Lists the cards in a deck, optionally filtered by a search query.
 *
 * @param userInputQuery - Text to look for in either side of the card; omit to list every card.
 * @throws {CardError} If the query is blank.
 * @throws {DeckError} If the deck does not exist.
 */
export function listCards(db: DatabaseSync, deckId: number, userInputQuery?: string): Card[] {
  getDeck(db, deckId);
  if (userInputQuery !== undefined && !userInputQuery.trim()) throw new CardError('Search query cannot be empty.');
  const query = userInputQuery ?? null;
  return queryAll<Card>(db, LIST_CARDS_SQL, deckId, query, query, query);
}

/**
 * Creates a card in a deck and returns it as stored.
 *
 * @param userInputFront - Raw front text; validated by {@link validateCardText}.
 * @param userInputBack - Raw back text; validated by {@link validateCardText}.
 * @throws {CardError} If either side is invalid.
 * @throws {DeckError} If the deck does not exist.
 */
export function createCard(db: DatabaseSync, deckId: number, userInputFront: string, userInputBack: string): Card {
  getDeck(db, deckId);
  const cleanedFront = validateCardText(userInputFront, 'Front');
  const cleanedBack = validateCardText(userInputBack, 'Back');
  const newCardResult = execute(db, CREATE_CARD_SQL, deckId, cleanedFront, cleanedBack);
  return getCard(db, Number(newCardResult.lastInsertRowid));
}

/**
 * Changes one or both sides of a manual card and returns it as stored.
 * A side left `undefined` keeps its current text.
 *
 * @throws {CardError} If the card does not exist, is generated from a note,
 *   no side was given, or a given side is invalid.
 */
export function editCard(db: DatabaseSync, cardId: number, userInputFront?: string, userInputBack?: string): Card {
  const card = getCard(db, cardId);
  ensureCardIsManual(db, cardId);
  if (userInputFront === undefined && userInputBack === undefined) throw new CardError('Specify --front and/or --back.');
  const cleanedFront = userInputFront === undefined ? card.front : validateCardText(userInputFront, 'Front');
  const cleanedBack = userInputBack === undefined ? card.back : validateCardText(userInputBack, 'Back');
  execute(db, UPDATE_CARD_SQL, cleanedFront, cleanedBack, cardId);
  return getCard(db, cardId);
}

/**
 * Deletes a manual card, along with its review history.
 *
 * @throws {CardError} If the card does not exist or is generated from a note.
 */
export function deleteCard(db: DatabaseSync, cardId: number): void {
  getCard(db, cardId); // existence check; the DELETE below would silently match nothing
  ensureCardIsManual(db, cardId);
  execute(db, DELETE_CARD_SQL, cardId);
}
