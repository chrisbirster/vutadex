import { getDatabase } from '../database/index.ts';

export function runDeckCommand(subcommand: string | undefined, rest: string[]): number {
  switch (subcommand) {
    case 'list': {
      const db = getDatabase();
      console.table(db.prepare('SELECT * FROM decks ORDER BY name').all());
      db.close();
      return 0;
    }
    case 'create': {
      const name = rest.join(' ').trim();
      if (!name) {
        console.error('Usage: vutadex deck create <name>');
        return 1;
      }
      const db = getDatabase();
      const result = db.prepare('INSERT INTO decks (name) VALUES (?)').run(name);
      db.close();
      console.log(`Created deck "${name}" (ID: ${result.lastInsertRowid})`);
      return 0;
    }
    default:
      console.error('Unknown deck command. Try: deck list or deck create <name>');
      return 1;
  }
}
