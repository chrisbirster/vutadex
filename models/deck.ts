export interface Deck {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  card_count?: number;
}

/** Row shape returned by the deck-name lookup. */
export interface DeckIdRow {
  id: number;
}
