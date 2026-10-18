import process from 'node:process';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

import { help } from './commands/help.ts';


let database: DatabaseSync | undefined;

const args = process.argv.slice(2);
const [command, subcommand, ...rest] = args;

switch (command) {
  case undefined:
  case 'help':
  case '-h':
  case '--help':
    help();
    break;

  case 'deck': {
    const db = getDatabase();

    switch (subcommand) {
      case 'list': {
        const decks = db.prepare(
          'SELECT * FROM decks ORDER BY name'
        ).all();

        console.table(decks);
        break;
      }

      case 'create': {
        const name = rest.join(' ').trim();
        if (!name) {
          console.error('Usage: vutadex deck create <name>');
          process.exitCode = 1;
          break;
        }
        const result = db.prepare('INSERT INTO decks (name) VALUES (?)').run(name);
        console.log(`Created deck "${name}" (ID: ${result.lastInsertRowid})`);
        break;
      }

      default:
        console.error('Unknown deck command. Try: deck list or deck create <name>');
        process.exitCode = 1;
    }

    break;
  }

  case 'card':
    getDatabase();
    console.log('Card command:', subcommand, ...rest);
    break;

  case 'study':
    getDatabase();
    console.log('Study command:', subcommand, ...rest);
    break;

  case 'stats':
    getDatabase();
    console.log('Statistics');
    break;

  case 'due':
    getDatabase();
    console.log('Due cards');
    break;

  case 'version':
  case '-v':
  case '--version':
    console.log('Vutadex v0.1.0');
    break;

  default:
    console.error(`Unknown command: ${command}`);
    process.exitCode = 1;
}

export function getDataHome(): string {
  const home = os.homedir();

  switch (process.platform) {
    case 'win32':
      return process.env.LOCALAPPDATA
        || path.join(home, 'AppData', 'Local');

    case 'darwin':
      return path.join(home, 'Library', 'Application Support');

    case 'linux':
    default:
      return process.env.XDG_DATA_HOME
        || path.join(home, '.local', 'share');
  }
}


export function getDatabase(): DatabaseSync {
  if (database) {
    return database;
  }

  const dataDirectory = path.join(
    getDataHome(),
    'vutadex'
  );

  fs.mkdirSync(dataDirectory, {
    recursive: true,
  });

  const databasePath = path.join(
    dataDirectory,
    'vdex.db'
  );

  const db = new DatabaseSync(databasePath);
  try {
    db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS decks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deck_id INTEGER NOT NULL,
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (deck_id)
        REFERENCES decks(id)
        ON DELETE CASCADE
    );
  `);
    database = db;
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
