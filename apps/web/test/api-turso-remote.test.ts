export {};
// Remote verification: runs the full API suite against a real hosted Turso
// database. Skips unless TURSO_REMOTE_URL (+ TURSO_AUTH_TOKEN) are set, so CI
// and local runs without credentials are unaffected. Point TURSO_REMOTE_URL at
// a THROWAWAY database: the suite writes test data and expects a fresh schema.
import { test } from 'node:test';
if (!process.env.TURSO_REMOTE_URL) {
  test('turso-remote API suite', { skip: 'TURSO_REMOTE_URL unset - manual remote verification only' }, () => {});
} else {
  process.env.VUTADEX_TEST_BACKEND = 'turso-remote';
  await import('./api.test.ts');
}
