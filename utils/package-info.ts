import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface PackageInfo {
  name: string;
  version: string;
}

/** Reads name and version from the nearest package.json above this file, so it works from source and from dist/. */
export function readPackageInfo(): PackageInfo {
  let directory = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(directory, 'package.json'))) {
    const parent = dirname(directory);
    if (parent === directory) return { name: 'vutadex', version: 'unknown' };
    directory = parent;
  }
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as Partial<PackageInfo>;
  return { name: manifest.name ?? 'vutadex', version: manifest.version ?? 'unknown' };
}
