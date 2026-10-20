import type { DatabaseSync } from 'node:sqlite';
import { getDeck } from './decks.ts';
import { listNotes } from './notes.ts';
import { locateImage } from './media.ts';
import { loadQueryByFilename, queryAll } from '../database/sql.ts';

const MANUAL_CARDS_SQL = loadQueryByFilename('deck-file/manual-cards.sql');

export class DeckFileError extends Error {}

/**
 * Export Plandalf .deck v2 as content-only NDJSON.
 * Deliberately never exports schedules, review history, SQLite IDs or media binaries.
 */
export function exportDeck(db: DatabaseSync, deckId: number): string {
  const deck = getDeck(db, deckId);
  const records: unknown[] = [
    { kind: 'deck', format: 'plandalf.deck', version: 2, name: deck.name }
  ];
  for (const note of listNotes(db, deckId).sort((a, b) => a.id - b.id)) {
    if (note.retired) continue;
    if (note.type === 'image-occlusion') {
      try {
        locateImage(note.fields[0]!);
      } catch {
        throw new DeckFileError('Cannot export image occlusion: its image is missing or invalid.');
      }
      // A content-only .deck file cannot carry image bytes.
      throw new DeckFileError('Image occlusion requires portable media support (M6.3).');
    }
    records.push({
      kind: 'note', note_type: note.type, fields: note.fields,
      tags_json: JSON.stringify(note.tags)
    });
  }
  const manual = queryAll<{ front: string; back: string }>(db, MANUAL_CARDS_SQL, deckId);
  for (const card of manual) {
    records.push({
      kind: 'note', note_type: 'basic', fields: [card.front, card.back], tags_json: '[]'
    });
  }
  return records.map(record => JSON.stringify(record)).join('\n') + '\n';
}
