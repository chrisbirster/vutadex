import { readFileSync } from 'node:fs';

/** Reads a query file from database/query/, e.g. loadQuery('decks/get.sql'). */
export function loadQuery(name: string): string {
  return readFileSync(new URL(`./query/${name}`, import.meta.url), 'utf8');
}
