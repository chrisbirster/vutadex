// Deletes ALL rows from every app table on a target database (schema kept).
// For throwaway verification databases only. Usage:
//   TURSO_REMOTE_URL=libsql://<db>.turso.io TURSO_AUTH_TOKEN=<token> \
//   node --experimental-strip-types scripts/remote-clean.ts --yes
process.env.TURSO_DATABASE_URL = process.env.TURSO_REMOTE_URL;
if (!process.env.TURSO_DATABASE_URL) { console.error('TURSO_REMOTE_URL is required'); process.exit(1); }
if (!process.argv.includes('--yes')) { console.error('Refusing without --yes. This deletes ALL rows on ' + process.env.TURSO_DATABASE_URL); process.exit(1); }
const db = await import('../server/db.ts');
const order = ['review_undo','account_changes','account_drafts','media_blobs','legacy_migrations','legacy_raw_events','study_activity','user_preferences','challenges','sessions','auth_attempts','review_events','study_sessions','cards','notes','decks','users'];
await db.transaction(async () => { for (const t of order) await db.run('DELETE FROM ' + t); });
let dirty = 0;
for (const t of order) {
  const r = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM ' + t);
  if (r!.n !== 0) { console.log('NONZERO ' + t + ' = ' + r!.n); dirty++; }
}
console.log(dirty === 0 ? 'all app tables empty (schema intact)' : dirty + ' tables still have rows');
db.closeStorage();
process.exit(dirty === 0 ? 0 : 1);
