export {};
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.TURSO_DATABASE_URL = 'file:' + join(mkdtempSync(join(tmpdir(), 'vutadex-integrity-libsql-')), 'i.db');
const { register } = await import('./storage-integrity.suite.ts');
register('libsql', await import('../server/db.ts'));
