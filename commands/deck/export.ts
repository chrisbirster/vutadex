import type { DatabaseSync } from 'node:sqlite';
import { parseDeckId } from './utils.ts';
import { exportDeck } from '../../services/deck-file.ts';

export function runDeckSubcommandExport(db: DatabaseSync, args: string[]): number {
  if (args.length !== 1) {
    console.error('Usage: deck export <deck-id> (writes NDJSON to stdout)');
    return 1;
  }
  const output = exportDeck(db, parseDeckId(args[0]));
  process.stdout.write(output);
  return 0;
}
