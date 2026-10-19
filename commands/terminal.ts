import { createInterface } from 'node:readline/promises';
import process from 'node:process';

export interface TerminalInteraction {
  readonly isTTY: boolean;
  confirm(question: string): Promise<boolean>;
  cardFields(existing?: { front: string; back: string }): Promise<{ front: string; back: string }>;
}

/** Injectable terminal boundary for deterministic tests and real readline in production. */
export function createTerminalInteraction(
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stdout,
): TerminalInteraction {
  return {
    get isTTY() { return Boolean(input.isTTY); },
    async confirm(question) {
      const rl = createInterface({ input, output });
      try { return /^(yes|y)$/i.test((await rl.question(question)).trim()); }
      finally { rl.close(); }
    },
    async cardFields(existing) {
      if (!input.isTTY) throw new Error('Interactive entry requires a terminal; pass --front and --back.');
      const rl = createInterface({ input, output });
      try {
        const front = await rl.question('Front (use \\n for newlines): ');
        const back = await rl.question('Back (use \\n for newlines): ');
        return {
          front: (front || existing?.front || '').replace(/\\n/g, '\n'),
          back: (back || existing?.back || '').replace(/\\n/g, '\n')
        };
      } finally { rl.close(); }
    }
  };
}
