import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runDoctorCommand } from '../commands/doctor.ts';
import type { TerminalInteraction } from '../commands/terminal.ts';
import { getDatabase } from '../database/index.ts';
import { latestVersion } from '../database/migrate.ts';
import { listMigrationFiles, loadMigrationByFilename } from '../database/sql.ts';
import { inspectSetup, setUpApp } from '../services/doctor.ts';
import { fetchLatestVersion, isNewerVersion } from '../services/updates.ts';
import type { UpdateStatus } from '../services/updates.ts';
import { runUpdateCommand } from '../commands/update.ts';

function withAppDirectory(run: (appDirectory: string) => void | Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'vdex-doctor-'));
  return Promise.resolve(run(join(root, 'vutadex'))).finally(() => rmSync(root, { recursive: true, force: true }));
}

function terminal(isTTY: boolean, answer = true): TerminalInteraction {
  return { isTTY, confirm: async () => answer, cardFields: async () => ({ front: '', back: '' }) };
}

async function quietly<T>(run: () => Promise<T>): Promise<T> {
  const originals = [console.log, console.error, console.table];
  console.log = console.error = console.table = () => { };
  try {
    return await run();
  } finally {
    [console.log, console.error, console.table] = originals;
  }
}

test('a fresh install has a directory and database to set up and inspecting changes nothing', () => withAppDirectory(appDirectory => {
  const checks = inspectSetup(appDirectory);
  assert.deepEqual(checks.map(item => item.status), ['todo', 'todo', 'ok']);
  assert.equal(existsSync(appDirectory), false);
}));

test('setUpApp creates everything and is safe to repeat', () => withAppDirectory(appDirectory => {
  setUpApp(appDirectory);
  setUpApp(appDirectory);
  assert.deepEqual(inspectSetup(appDirectory).map(item => item.status), ['ok', 'ok', 'ok']);
}));

test('a database behind the latest schema is a todo; one ahead is a problem', () => withAppDirectory(appDirectory => {
  setUpApp(appDirectory);
  const db = new DatabaseSync(join(appDirectory, 'vdex.db'));
  try {
    db.exec(`PRAGMA user_version = ${latestVersion() - 1}`);
    assert.equal(inspectSetup(appDirectory)[1]!.status, 'todo');
    db.exec(`PRAGMA user_version = ${latestVersion() + 1}`);
    assert.equal(inspectSetup(appDirectory)[1]!.status, 'problem');
  } finally {
    db.close();
  }
}));

test('a corrupt database file is a problem and is left alone', () => withAppDirectory(async appDirectory => {
  setUpApp(appDirectory);
  writeFileSync(join(appDirectory, 'vdex.db'), 'not a database');
  assert.equal(inspectSetup(appDirectory)[1]!.status, 'problem');
  assert.equal(await quietly(() => runDoctorCommand(['--offline', '--yes'], terminal(false), appDirectory)), 1);
}));

test('doctor --check reports without creating anything', () => withAppDirectory(async appDirectory => {
  assert.equal(await quietly(() => runDoctorCommand(['--offline', '--check'], terminal(true), appDirectory)), 1);
  assert.equal(existsSync(appDirectory), false);
}));

test('doctor needs --yes when there is no terminal', () => withAppDirectory(async appDirectory => {
  assert.equal(await quietly(() => runDoctorCommand(['--offline', '--offline'], terminal(false), appDirectory)), 1);
  assert.equal(existsSync(appDirectory), false);
  assert.equal(await quietly(() => runDoctorCommand(['--offline', '--yes'], terminal(false), appDirectory)), 0);
  assert.deepEqual(inspectSetup(appDirectory).map(item => item.status), ['ok', 'ok', 'ok']);
}));

test('declining the confirmation sets nothing up; accepting does', () => withAppDirectory(async appDirectory => {
  assert.equal(await quietly(() => runDoctorCommand(['--offline', '--offline'], terminal(true, false), appDirectory)), 0);
  assert.equal(existsSync(appDirectory), false);
  assert.equal(await quietly(() => runDoctorCommand(['--offline', '--offline'], terminal(true, true), appDirectory)), 0);
  assert.equal(existsSync(join(appDirectory, 'vdex.db')), true);
}));

test('doctor on a finished setup reports success and rejects unknown flags', () => withAppDirectory(async appDirectory => {
  setUpApp(appDirectory);
  assert.equal(await quietly(() => runDoctorCommand(['--offline', '--offline'], terminal(false), appDirectory)), 0);
  assert.equal(await quietly(() => runDoctorCommand(['--offline', '--bogus'], terminal(false), appDirectory)), 1);
}));

test('getDatabase creates and migrates on first run, then just opens', () => withAppDirectory(appDirectory => {
  getDatabase(appDirectory).close();
  assert.deepEqual(inspectSetup(appDirectory)[1]!.status, 'ok');
  getDatabase(appDirectory).close();
}));

test('getDatabase upgrades an older database by itself and refuses a newer one', () => withAppDirectory(appDirectory => {
  mkdirSync(appDirectory, { recursive: true });
  const db = new DatabaseSync(join(appDirectory, 'vdex.db'));
  try {
    db.exec(loadMigrationByFilename(listMigrationFiles()[0]!));
    db.exec('PRAGMA user_version = 1');
    getDatabase(appDirectory).close();
    assert.equal((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, latestVersion());
    db.exec(`PRAGMA user_version = ${latestVersion() + 1}`);
    assert.throws(() => getDatabase(appDirectory), /newer version/);
  } finally {
    db.close();
  }
}));

const upToDate = async (): Promise<UpdateStatus> => ({ current: '1.0.0', latest: '1.0.0', updateAvailable: false });
const behind = async (): Promise<UpdateStatus> => ({ current: '1.0.0', latest: '1.2.0', updateAvailable: true });
const unreachable = async (): Promise<UpdateStatus> => ({ current: '1.0.0', latest: null, updateAvailable: false });

test('an available update or an unreachable registry never makes doctor fail', () => withAppDirectory(async appDirectory => {
  setUpApp(appDirectory);
  for (const check of [upToDate, behind, unreachable]) {
    assert.equal(await quietly(() => runDoctorCommand([], terminal(false), appDirectory, check)), 0);
  }
}));

test('isNewerVersion compares x.y.z numerically and ignores anything else', () => {
  assert.equal(isNewerVersion('1.10.0', '1.9.9'), true);
  assert.equal(isNewerVersion('2.0.0', '1.99.99'), true);
  assert.equal(isNewerVersion('1.0.0', '1.0.0'), false);
  assert.equal(isNewerVersion('1.0.0', '1.0.1'), false);
  assert.equal(isNewerVersion('1.1.0-beta.1', '1.0.0'), false);
  assert.equal(isNewerVersion('latest', '1.0.0'), false);
});

test('fetchLatestVersion accepts a plain version and treats everything else as unknown', async () => {
  const reply = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body }) as Response) as typeof fetch;
  assert.equal(await fetchLatestVersion('vutadex', reply({ version: '1.4.2' })), '1.4.2');
  assert.equal(await fetchLatestVersion('vutadex', reply({ version: '1.4.2-rc.1' })), null);
  assert.equal(await fetchLatestVersion('vutadex', reply({ version: '1.4.2' }, false)), null);
  assert.equal(await fetchLatestVersion('vutadex', (async () => { throw new Error('offline'); }) as typeof fetch), null);
});

test('update installs only when a newer version exists and the user agrees', async () => {
  const installs: string[] = [];
  const install = (name: string) => { installs.push(name); return { status: 0, error: undefined }; };
  assert.equal(await quietly(() => runUpdateCommand([], terminal(true), upToDate, install)), 0);
  assert.equal(await quietly(() => runUpdateCommand([], terminal(true), unreachable, install)), 1);
  assert.equal(await quietly(() => runUpdateCommand([], terminal(false), behind, install)), 1);
  assert.equal(await quietly(() => runUpdateCommand([], terminal(true, false), behind, install)), 0);
  assert.deepEqual(installs, []);
  assert.equal(await quietly(() => runUpdateCommand([], terminal(true, true), behind, install)), 0);
  assert.equal(await quietly(() => runUpdateCommand(['--yes'], terminal(false), behind, install)), 0);
  assert.deepEqual(installs, ['vutadex', 'vutadex']);
  assert.equal(await quietly(() => runUpdateCommand(['--yes'], terminal(false), behind, () => ({ status: 1, error: undefined }))), 1);
});
