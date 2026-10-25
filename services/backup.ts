import { backup, DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { APP_NAME, DB_NAME } from '../constants.ts';
import { getDataHome } from '../utils/paths.ts';

export class BackupError extends Error {}
type Entry = { sha256: string; base64: string };
type Archive = { format: 'vutadex.backup'; version: 1; database: Entry; media: Record<string, Entry> };
const HASH = /^[0-9a-f]{64}$/;
const MAX_ARCHIVE = 256 * 1024 * 1024;

function hash(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function entry(bytes: Buffer): Entry {
  return { sha256: hash(bytes), base64: bytes.toString('base64') };
}
function decode(item: unknown): Buffer {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new BackupError('Invalid archive entry.');
  const record = item as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== 'base64,sha256' ||
      typeof record.base64 !== 'string' || typeof record.sha256 !== 'string' ||
      !HASH.test(record.sha256) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(record.base64)) {
    throw new BackupError('Invalid archive encoding.');
  }
  const bytes = Buffer.from(record.base64, 'base64');
  if (hash(bytes) !== record.sha256) throw new BackupError('Archive checksum mismatch.');
  return bytes;
}

/** Create a consistent SQLite backup plus verified media snapshot. Does not modify the source. */
export async function createBackup(db: DatabaseSync, output: string, appDir = path.join(getDataHome(), APP_NAME)): Promise<void> {
  if (fs.existsSync(output)) throw new BackupError('Refusing to overwrite an existing backup.');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'vdex-snapshot-'));
  try {
    const sqlite = path.join(temporary, DB_NAME);
    await backup(db, sqlite);
    const media: Record<string, Entry> = {};
    const mediaDir = path.join(appDir, 'media');
    if (fs.existsSync(mediaDir)) {
      for (const name of fs.readdirSync(mediaDir)) {
        if (!HASH.test(name)) throw new BackupError('Unexpected media filename.');
        const filename = path.join(mediaDir, name);
        if (!fs.lstatSync(filename).isFile()) throw new BackupError('Refusing non-file media.');
        const bytes = fs.readFileSync(filename);
        if (hash(bytes) !== name) throw new BackupError('Corrupt media checksum.');
        media[name] = entry(bytes);
      }
    }
    const archive: Archive = { format: 'vutadex.backup', version: 1,
      database: entry(fs.readFileSync(sqlite)), media };
    const content = JSON.stringify(archive);
    if (Buffer.byteLength(content) > MAX_ARCHIVE) throw new BackupError('Backup exceeds 256 MiB.');
    fs.writeFileSync(output, content, { flag: 'wx', mode: 0o600 });
  } finally { fs.rmSync(temporary, {recursive:true,force:true}); }
}

/**
 * Restore only into an absent app directory. Never overwrites an existing database.
 * Validates every checksum and SQLite integrity before publishing via same-parent rename.
 */
export function restoreBackup(filename: string, appDir = path.join(getDataHome(), APP_NAME)): void {
  const metadata = fs.lstatSync(filename);
  if (!metadata.isFile() || metadata.size > MAX_ARCHIVE) throw new BackupError('Invalid backup file size or type.');
  if (fs.existsSync(appDir)) throw new BackupError('Destination already exists; restore refuses to overwrite data.');
  const archive = JSON.parse(fs.readFileSync(filename, 'utf8')) as Record<string, unknown>;
  if (!archive || archive.format !== 'vutadex.backup' || archive.version !== 1 ||
      !archive.media || typeof archive.media !== 'object' || Array.isArray(archive.media)) {
    throw new BackupError('Unrecognized backup format.');
  }
  const database = decode(archive.database);
  const media = archive.media as Record<string, unknown>;
  const blobs = new Map<string, Buffer>();
  for (const [name, value] of Object.entries(media)) {
    if (!HASH.test(name)) throw new BackupError('Invalid media name.');
    const bytes = decode(value);
    if (hash(bytes) !== name) throw new BackupError('Media checksum does not match filename.');
    blobs.set(name, bytes);
  }
  const parent = path.dirname(appDir);
  fs.mkdirSync(parent, {recursive:true});
  const temporary = fs.mkdtempSync(path.join(parent, '.vdex-restore-'));
  try {
    const databaseFile = path.join(temporary, DB_NAME);
    fs.writeFileSync(databaseFile, database, {mode:0o600});
    const db = new DatabaseSync(databaseFile, {readOnly:true});
    try {
      const result = db.prepare('PRAGMA integrity_check').get() as {integrity_check:string};
      const version = db.prepare('PRAGMA user_version').get() as {user_version:number};
      if (result.integrity_check !== 'ok' || (version.user_version !== 4 && version.user_version !== 5)) {
        throw new BackupError('Backup SQLite integrity or schema version is invalid.');
      }
    } finally { db.close(); }
    if (blobs.size) {
      const directory = path.join(temporary, 'media');
      fs.mkdirSync(directory);
      for (const [name, bytes] of blobs) {
        fs.writeFileSync(path.join(directory, name), bytes, {flag:'wx',mode:0o600});
      }
    }
    if (fs.existsSync(appDir)) throw new BackupError('Destination appeared during restore.');
    fs.renameSync(temporary, appDir);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, {recursive:true,force:true});
  }
}
