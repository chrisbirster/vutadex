import type { DatabaseSync } from 'node:sqlite';
import { readFileSync, statSync } from 'node:fs';
import { MAX_IMPORT_BYTES } from '../../constants.ts';
import { importDeckFile } from '../../services/deck-import.ts';
import { DeckFileError } from '../../services/deck-file.ts';
import { parseCommandArgs } from '../utils.ts';
import { showUsageInformation } from './utils.ts';

/**
 * Reads a .deck file after checking it is a regular file of at most MAX_IMPORT_BYTES.
 *
 * @throws {DeckFileError} If the path cannot be read, is not a regular file, or is too large.
 */
function readDeckFile(path: string): string {
  try {
    const fileStats = statSync(path);
    if (!fileStats.isFile() || fileStats.size > MAX_IMPORT_BYTES) {
      throw new DeckFileError(`Import must be a regular .deck file under ${MAX_IMPORT_BYTES / 1024 / 1024} MiB.`);
    }
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (error instanceof DeckFileError) throw error;
    throw new DeckFileError(`Cannot read "${path}": ${(error as Error).message}`);
  }
}

export function runDeckSubcommandImport(db: DatabaseSync, args: string[]): number {
  const parsedArgs = parseCommandArgs(args, [], 1, 1);
  if (!parsedArgs) return showUsageInformation();
  const result = importDeckFile(db, readDeckFile(parsedArgs.positionals[0] as string));
  console.log(`Imported deck ${result.deckId} (${result.notes} notes).`);
  return 0;
}
