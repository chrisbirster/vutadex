import process from 'node:process';
import { createInterface, emitKeypressEvents } from 'node:readline';

export interface StudyInput {
  ask(prompt: string): Promise<string | null>;
  close(): void;
}

/** Single-key input on a TTY; one command per line when input is piped. */
export function makeStudyInput(): StudyInput {
  if (!process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
    const iterator = rl[Symbol.asyncIterator]();
    return {
      async ask(prompt: string): Promise<string | null> {
        process.stdout.write(prompt);
        const next = await iterator.next();
        return next.done ? null : next.value.trim().toLowerCase();
      },
      close(): void { rl.close(); }
    };
  }

  const input = process.stdin;
  emitKeypressEvents(input);
  const wasRaw = input.isRaw ?? false;
  input.setRawMode(true);
  input.resume();
  const buffered: string[] = [];
  let awaiting: ((answer: string | null) => void) | undefined;
  let closed = false;
  const onKey = (str: string, key: { name?: string; ctrl?: boolean }): void => {
    if (closed) return;
    const value = (key?.ctrl && key.name === 'c') ? 'q'
      : key?.name === 'return' || key?.name === 'enter' ? ''
      : str === ' ' ? '' : str?.toLowerCase();
    if (value === undefined || value.length > 1) return;
    process.stdout.write(value ? value + '\n' : '\n');
    if (awaiting) {
      const deliver = awaiting;
      awaiting = undefined;
      deliver(value);
    } else buffered.push(value);
  };
  input.on('keypress', onKey);
  return {
    ask(prompt: string): Promise<string | null> {
      process.stdout.write(prompt);
      if (buffered.length) return Promise.resolve(buffered.shift()!);
      return new Promise(resolve => { awaiting = resolve; });
    },
    close(): void {
      if (closed) return;
      closed = true;
      input.off('keypress', onKey);
      if (awaiting) { awaiting(null); awaiting = undefined; }
      input.setRawMode(wasRaw);
      input.pause();
    }
  };
}
