export {};
// Runs the full API suite against the libsql backend (local file: URL, no
// network). The web server's hosted backend is Turso via @libsql/client; this
// suite proves the same HTTP behavior on that client/engine locally. Direct
// node:sqlite file-inspection tests are skipped by api.test.ts in this mode.
process.env.VUTADEX_TEST_BACKEND = 'libsql';
await import('./api.test.ts');
