// Point-measurement verification against a real hosted Turso (libsql) database.
// Usage: TURSO_REMOTE_URL=libsql://<db>.turso.io TURSO_AUTH_TOKEN=<token> \
//   node --experimental-strip-types scripts/remote-verify.ts [--rotation]
// Never commit credentials. Point this at a THROWAWAY database: it writes and
// deletes marker rows (smk-*/u-smk-*). Reports measured behavior; it does not
// fail on measured differences - read the output. --rotation adds a 65-second
// wait and re-measures PRAGMA foreign_keys across the client's ~60s WebSocket
// session rotation.
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

process.env.TURSO_DATABASE_URL = process.env.TURSO_REMOTE_URL;
if (!process.env.TURSO_DATABASE_URL) { console.error('TURSO_REMOTE_URL is required'); process.exit(1); }
const db = await import('../server/db.ts');
const uid = 'smk-' + randomBytes(4).toString('hex');
const rec = (k: string, v: string) => console.log(k + ' => ' + v);

rec('backend', (db as unknown as { storageBackend?: string }).storageBackend ?? 'unknown');
const tables = await db.list<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'libsql_%' ORDER BY name");
rec('schema tables bootstrapped', String(tables.length));
rec('PRAGMA foreign_keys (session 1)', JSON.stringify(await db.query('PRAGMA foreign_keys')));

await db.run('INSERT INTO users(id,email,created_at) VALUES(?,?,?)', uid, uid + '@t.dev', Date.now());
try {
  await db.run("INSERT INTO cards(id,note_id,deck_id,owner_id,variant,front,back,due_at) VALUES(?,?,?,?,?,?,?,?)",
    'c-' + uid, 'no-such-note', 'no-such-deck', uid, 'forward', 'f', 'b', Date.now());
  rec('FK orphan card INSERT', 'ACCEPTED (remote FK enforcement OFF for this session)');
  await db.run('DELETE FROM cards WHERE id=?', 'c-' + uid);
} catch (e) {
  rec('FK orphan card INSERT', 'REJECTED (' + String((e as Error)?.message).slice(0, 80) + ')');
}

const bytes = randomBytes(2 * 1024 * 1024);
const sha = 'smk-' + randomBytes(16).toString('hex');
await db.run('INSERT INTO media_blobs(owner_id,sha256,mime,bytes,width,height,created_at) VALUES(?,?,?,?,?,?,?)', uid, sha, 'image/png', bytes, 100, 100, Date.now());
const row = await db.query<{ bytes: Uint8Array }>('SELECT bytes FROM media_blobs WHERE owner_id=? AND sha256=?', uid, sha);
rec('2MB blob roundtrip', row && Buffer.from(row.bytes).equals(bytes) ? 'MATCH' : 'MISMATCH/MISSING');
await db.run('DELETE FROM media_blobs WHERE owner_id=?', uid);

const rbKey = 'rb-' + randomBytes(4).toString('hex');
try {
  await db.transaction(async () => {
    await db.run('INSERT INTO auth_attempts(key,count,reset_at) VALUES(?,?,?)', rbKey, 1, 999);
    await db.run('INSERT INTO auth_attempts(key,count,reset_at) VALUES(?,?,?)', rbKey + '-2', 2, 999);
    throw new Error('forced mid-transaction failure');
  });
  rec('tx rollback', 'NO ERROR THROWN (unexpected)');
} catch (e) {
  const a = await db.query('SELECT key FROM auth_attempts WHERE key=?', rbKey);
  const b = await db.query('SELECT key FROM auth_attempts WHERE key=?', rbKey + '-2');
  rec('tx rollback', /forced/.test(String((e as Error)?.message)) && !a && !b ? 'CLEAN (zero partial writes)' : 'PARTIAL WRITES VISIBLE a=' + !!a + ' b=' + !!b);
}

const ccKey = 'cc-' + randomBytes(4).toString('hex');
const settled = await Promise.allSettled(Array.from({ length: 8 }, () => db.transaction(async () => {
  const r = await db.query<{ count: number }>('SELECT count FROM auth_attempts WHERE key=?', ccKey);
  if (!r) await db.run('INSERT INTO auth_attempts(key,count,reset_at) VALUES(?,?,?)', ccKey, 1, Date.now() + 60000);
  else await db.run('UPDATE auth_attempts SET count=count+1 WHERE key=?', ccKey);
})));
const cc = await db.query<{ count: number }>('SELECT count FROM auth_attempts WHERE key=?', ccKey);
rec('8 concurrent txs', 'ok=' + settled.filter(s => s.status === 'fulfilled').length + ' rejected=' + settled.filter(s => s.status === 'rejected').length + ' final_count=' + cc?.count);
await db.run('DELETE FROM auth_attempts WHERE key=?', ccKey);

for (let i = 0; i < 10; i++)
  await db.run('INSERT INTO account_changes(owner_id,kind,resource,resource_id,created_at) VALUES(?,?,?,?,?)', uid, 'updated', 'note', 'n' + i, Date.now());
const seqs = (await db.list<{ seq: number }>('SELECT seq FROM account_changes WHERE owner_id=? ORDER BY seq ASC', uid)).map(r => r.seq);
rec('change-feed seq', seqs.length === 10 && seqs.every((v, i) => i === 0 || v > seqs[i - 1]!) ? 'STRICTLY INCREASING' : 'BROKEN: ' + seqs.join(','));
await db.run('DELETE FROM account_changes WHERE owner_id=?', uid);

if (process.argv.includes('--rotation')) {
  await delay(65_000);
  rec('PRAGMA foreign_keys (after 65s, new WS session)', JSON.stringify(await db.query('PRAGMA foreign_keys')));
}

await db.run('DELETE FROM users WHERE id=?', uid);
rec('marker cleanup', 'done');
db.closeStorage();
