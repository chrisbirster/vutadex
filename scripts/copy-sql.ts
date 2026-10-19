import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// tsc does not copy non-TypeScript files. database/sql.ts and database/migrate.ts read these
// directories relative to their own location, so they must sit next to the compiled output.
const directories = ['query', 'migrations'];

for (const name of directories) {
  const from = fileURLToPath(new URL(`../database/${name}`, import.meta.url));
  const to = fileURLToPath(new URL(`../dist/database/${name}`, import.meta.url));
  cpSync(from, to, { recursive: true });
}
