import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Walks up from this file to the nearest package.json, so it works from source and from dist/. */
function readVersion(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(directory, 'package.json'))) {
    const parent = dirname(directory);
    if (parent === directory) return 'unknown';
    directory = parent;
  }
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as { version?: string };
  return manifest.version ?? 'unknown';
}

export function handleVersionCommand(): number {
  console.log(`Vutadex v${readVersion()}`);
  return 0;
}
