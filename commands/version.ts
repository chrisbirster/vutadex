import { readFileSync } from 'node:fs';

export function handleVersionCommand(): number {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  console.log('Vutadex v' + manifest.version);
  return 0;
}
