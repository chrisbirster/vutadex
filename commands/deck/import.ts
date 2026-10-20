import type { DatabaseSync } from 'node:sqlite';
import { readFileSync, statSync } from 'node:fs';
import { importDeckFile } from '../../services/deck-import.ts';
import { DeckFileError } from '../../services/deck-file.ts';

export function runDeckSubcommandImport(db: DatabaseSync, args: string[]): number {
  if (args.length !== 1) {
    console.error('Usage: deck import <path.deck>');
    return 1;
  }
  const path = args[0]!;
  const stat = statSync(path);
  if (!stat.isFile() || stat.size > 64 * 1024 * 1024) {
    throw new DeckFileError('Import must be a regular .deck file under 64 MiB.');
  }
  const result = importDeckFile(db, readFileSync(path, 'utf8'));
  console.log('Imported deck ' + result.deckId + ' (' + result.notes + ' notes).');
  return 0;
}
