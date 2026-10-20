import { getDatabase } from '../database/index.ts';
import { createBackup, restoreBackup } from '../services/backup.ts';

export async function runBackupCommand(subcommand: string | undefined, args: string[]): Promise<number> {
  if (subcommand === 'create' && args.length === 1) {
    const db = getDatabase();
    try { await createBackup(db, args[0]!); }
    finally { db.close(); }
    console.log('Backup written: ' + args[0]);
    return 0;
  }
  if (subcommand === 'restore' && args.length === 1) {
    // No SQLite connection must be open when a fresh destination is published.
    restoreBackup(args[0]!);
    console.log('Backup restored to the local Vutadex data directory.');
    return 0;
  }
  console.error('Usage: backup create <file> | backup restore <file> (restore only into an absent data directory)');
  return 1;
}
