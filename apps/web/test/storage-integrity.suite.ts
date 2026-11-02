import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

// Integrity invariants asserted against BOTH storage backends (node:sqlite and
// libsql via file: URL). These test the storage layer directly. They do NOT
// prove remote Turso behavior (session rotation, network failure, remote FK
// defaults) - that gate is the later staging pass against the real database.
export function register(backend: string, db: typeof import('../server/db.ts')): void {
  const uid = 'u-' + randomBytes(4).toString('hex');

  test(backend + ': transaction rollback leaves zero partial writes', async () => {
    const key = 'rb-' + randomBytes(4).toString('hex');
    await assert.rejects(db.transaction(async () => {
      await db.run('INSERT INTO auth_attempts(key,count,reset_at) VALUES(?,?,?)', key, 1, 999);
      await db.run('INSERT INTO auth_attempts(key,count,reset_at) VALUES(?,?,?)', key + '-2', 2, 999);
      throw new Error('forced mid-transaction failure');
    }), /forced mid-transaction failure/);
    assert.equal(await db.query('SELECT key FROM auth_attempts WHERE key=?', key), undefined);
    assert.equal(await db.query('SELECT key FROM auth_attempts WHERE key=?', key + '-2'), undefined);
  });

  test(backend + ': concurrent transactions serialize without busy errors or lost updates', async () => {
    const key = 'cc-' + randomBytes(4).toString('hex');
    const workers = Array.from({ length: 8 }, () => db.transaction(async () => {
      const row = await db.query<{ count: number }>('SELECT count FROM auth_attempts WHERE key=?', key);
      if (!row) await db.run('INSERT INTO auth_attempts(key,count,reset_at) VALUES(?,?,?)', key, 1, Date.now() + 60000);
      else await db.run('UPDATE auth_attempts SET count=count+1 WHERE key=?', key);
    }));
    await Promise.all(workers);
    const row = await db.query<{ count: number }>('SELECT count FROM auth_attempts WHERE key=?', key);
    assert.equal(row?.count, 8);
  });

  test(backend + ': concurrent independent writes all land', async () => {
    const keys = Array.from({ length: 20 }, (_, i) => 'ci-' + i + '-' + randomBytes(3).toString('hex'));
    await Promise.all(keys.map(k => db.run('INSERT INTO auth_attempts(key,count,reset_at) VALUES(?,?,?)', k, 1, 999)));
    const rows = await db.list<{ key: string }>("SELECT key FROM auth_attempts WHERE key LIKE 'ci-%'");
    for (const k of keys) assert.ok(rows.some(r => r.key === k), 'missing ' + k);
  });

  test(backend + ': media blob roundtrips byte-identical at app scale (2MB cap)', async () => {
    await db.run('INSERT INTO users(id,email,created_at) VALUES(?,?,?)', uid, uid + '@t.dev', Date.now());
    const bytes = randomBytes(2 * 1024 * 1024);
    const sha = randomBytes(32).toString('hex');
    await db.run('INSERT INTO media_blobs(owner_id,sha256,mime,bytes,width,height,created_at) VALUES(?,?,?,?,?,?,?)',
      uid, sha, 'image/png', bytes, 100, 100, Date.now());
    const row = await db.query<{ bytes: Uint8Array }>('SELECT bytes FROM media_blobs WHERE owner_id=? AND sha256=?', uid, sha);
    assert.ok(row);
    assert.equal(Buffer.from(row.bytes).equals(bytes), true);
  });

  test(backend + ': change feed seq strictly increases per owner', async () => {
    for (let i = 0; i < 50; i++)
      await db.run('INSERT INTO account_changes(owner_id,kind,resource,resource_id,created_at) VALUES(?,?,?,?,?)', uid, 'updated', 'note', 'n' + i, Date.now());
    const rows = await db.list<{ seq: number }>('SELECT seq FROM account_changes WHERE owner_id=? ORDER BY seq ASC', uid);
    assert.equal(rows.length, 50);
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i]!.seq > rows[i - 1]!.seq, 'seq not increasing');
  });

  test(backend + ': foreign key insert-time integrity is enforced on local backends', async () => {
    // node:sqlite: PRAGMA foreign_keys=ON at open. libsql file: backend: same
    // pragma, persistent connection. Remote Turso: unknown until staging - see
    // runbook; this test documents the local guarantee only.
    await assert.rejects(db.run(
      "INSERT INTO cards(id,note_id,deck_id,owner_id,variant,front,back,due_at) VALUES(?,?,?,?,?,?,?,?)",
      'c-' + randomBytes(4).toString('hex'), 'no-such-note', 'no-such-deck', uid, 'forward', 'f', 'b', Date.now()),
      /FOREIGN KEY/i);
  });
}
