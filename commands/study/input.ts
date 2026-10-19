import process from 'node:process';
import { createInterface, emitKeypressEvents } from 'node:readline';

export interface StudyInput {
  /** Single key, on TTY, or one command per line when stdin is piped. */
  ask(prompt: string): Promise<string | null>;
  /** Read a full unmodified answer line. */
  askText(prompt: string): Promise<string | null>;
  close(): void;
}

type Keypress = { name?: string; ctrl?: boolean; sequence?: string };

/** Reads study input line by line from a pipe or file; `ask` lowercases and trims, `askText` does not. */
function makePipedStudyInput(): StudyInput {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const lines = rl[Symbol.asyncIterator]();
  const nextLine = async (prompt: string, normalize: boolean): Promise<string | null> => {
    process.stdout.write(prompt);
    const result = await lines.next();
    if (result.done) return null;
    return normalize ? result.value.trim().toLowerCase() : result.value;
  };
  return {
    ask(prompt: string) { return nextLine(prompt, true); },
    askText(prompt: string) { return nextLine(prompt, false); },
    close() { rl.close(); }
  };
}

/**
 * Reads study input from a terminal in raw mode: `ask` resolves on a single key
 * (Space/Enter becomes `''`), `askText` collects a full line with backspace support.
 */
function makeTerminalStudyInput(): StudyInput {
  const input = process.stdin;
  emitKeypressEvents(input);
  const wasRaw = input.isRaw ?? false;
  input.setRawMode(true);
  input.resume();

  let closed = false;
  let mode: 'key' | 'text' = 'key';
  let textBuffer = '';
  const buffered: string[] = [];
  let deliver: ((value: string | null) => void) | undefined;

  const resolve = (value: string | null): void => {
    if (deliver) {
      const callback = deliver;
      deliver = undefined;
      callback(value);
    } else if (value !== null) {
      buffered.push(value);
    }
  };

  const onKey = (str: string, key: Keypress): void => {
    if (closed) return;
    if (key.ctrl && key.name === 'c') {
      process.stdout.write('^C\n');
      resolve(mode === 'text' ? null : 'q');
      return;
    }
    if (mode === 'text') {
      if (key.name === 'return' || key.name === 'enter') {
        process.stdout.write('\n');
        const answer = textBuffer;
        textBuffer = '';
        mode = 'key';
        resolve(answer);
      } else if (key.name === 'backspace') {
        if (textBuffer.length) {
          textBuffer = textBuffer.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else if (typeof str === 'string' && str.length && !key.ctrl && !/[\x00-\x08\x0b-\x1f\x7f]/.test(str)) {
        textBuffer += str;
        process.stdout.write(str);
      }
      return;
    }
    const isReveal = key.name === 'return' || key.name === 'enter' || str === ' ';
    const value = isReveal ? '' : typeof str === 'string' ? str.toLowerCase() : '';
    if (value.length > 1) return;
    process.stdout.write(value ? value + '\n' : '\n');
    resolve(value);
  };
  input.on('keypress', onKey);

  const ask = (prompt: string, kind: 'key' | 'text'): Promise<string | null> => {
    process.stdout.write(prompt);
    mode = kind;
    if (kind === 'key' && buffered.length) return Promise.resolve(buffered.shift()!);
    return new Promise(resolvePromise => { deliver = resolvePromise; });
  };

  return {
    ask(prompt: string) { return ask(prompt, 'key'); },
    askText(prompt: string) { return ask(prompt, 'text'); },
    close() {
      if (closed) return;
      closed = true;
      input.off('keypress', onKey);
      if (deliver) {
        deliver(null);
        deliver = undefined;
      }
      input.setRawMode(wasRaw);
      input.pause();
    }
  };
}

export function makeStudyInput(): StudyInput {
  return process.stdin.isTTY ? makeTerminalStudyInput() : makePipedStudyInput();
}
