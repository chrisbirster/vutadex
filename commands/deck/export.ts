import type { DatabaseSync } from 'node:sqlite';
import { exportDeck } from '../../services/deck-file.ts';
import { parseCommandArgs } from '../utils.ts';
import { showUsageInformation, parseDeckId } from './utils.ts';

export function runDeckSubcommandExport(db: DatabaseSync, args: string[]): number {
  const parsedArgs = parseCommandArgs(args, [], 1, 1);
  if (!parsedArgs) return showUsageInformation();
  process.stdout.write(exportDeck(db, parseDeckId(parsedArgs.positionals[0])));
  return 0;
}
