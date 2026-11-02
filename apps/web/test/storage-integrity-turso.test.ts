export {};
// Remote verification: storage-integrity invariants against a real hosted Turso
// database. Skips unless TURSO_REMOTE_URL (+ TURSO_AUTH_TOKEN) are set.
import { test } from 'node:test';
if (!process.env.TURSO_REMOTE_URL) {
  test('turso-remote storage integrity suite', { skip: 'TURSO_REMOTE_URL unset - manual remote verification only' }, () => {});
} else {
  process.env.TURSO_DATABASE_URL = process.env.TURSO_REMOTE_URL;
  const { register } = await import('./storage-integrity.suite.ts');
  register('turso-remote', await import('../server/db.ts'));
}
