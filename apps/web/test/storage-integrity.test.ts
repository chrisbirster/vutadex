import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.VUTADEX_DB = join(mkdtempSync(join(tmpdir(), 'vutadex-integrity-')), 'i.db');
const { register } = await import('./storage-integrity.suite.ts');
register('node:sqlite', await import('../server/db.ts'));
