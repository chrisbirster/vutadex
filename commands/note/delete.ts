import { DatabaseSync } from 'node:sqlite';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { getNote, retireNote } from '../../services/notes.ts';
import { NoteError } from '../../services/note-types.ts';
import { showUsageInformation, parseNoteId } from './utils.ts';

export async function runNoteSubcommandDelete(db: DatabaseSync, args: string[]): Promise<number> {
  if (args.length < 1 || args.length > 2 || (args.length === 2 && args[1] !== '--yes')) return showUsageInformation();
  const noteId = parseNoteId(args[0]);
  const note = getNote(db, noteId);
  if (!args.includes('--yes')) {
    if (!process.stdin.isTTY) throw new NoteError('Deletion requires confirmation in a terminal or --yes.');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    let answer: string;
    try {
      answer = await rl.question(`Retire ${note.type} note ${noteId} and its generated cards? [y/N] `);
    } finally {
      rl.close();
    }
    if (!/^(y|yes)$/i.test(answer.trim())) {
      console.log('Deletion cancelled.');
      return 0;
    }
  }
  retireNote(db, noteId);
  console.log(`Retired note ${noteId}; existing FSRS history preserved.`);
  return 0;
}
