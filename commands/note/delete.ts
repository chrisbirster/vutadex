import { DatabaseSync } from 'node:sqlite';
import { getNote, retireNote } from '../../services/notes.ts';
import { NoteError } from '../../services/note-types.ts';
import { showUsageInformation, parseNoteId } from './utils.ts';
import { createTerminalInteraction } from '../terminal.ts';
import type { TerminalInteraction } from '../terminal.ts';


export async function runNoteSubcommandDelete(db: DatabaseSync, args: string[], terminal: TerminalInteraction = createTerminalInteraction()): Promise<number> {
  if (args.length < 1 || args.length > 2 || (args.length === 2 && args[1] !== '--yes')) return showUsageInformation();
  const noteId = parseNoteId(args[0]);
  const note = getNote(db, noteId);
  if (!args.includes('--yes')) {
    if (!terminal.isTTY) throw new NoteError('Deletion requires confirmation in a terminal or --yes.');
    const confirmed = await terminal.confirm(`Retire ${note.type} note ${noteId} and its generated cards? [y/N] `);
    if (!confirmed) {
      console.log('Deletion cancelled.');
      return 0;
    }
  }
  retireNote(db, noteId);
  console.log(`Retired note ${noteId}; existing FSRS history preserved.`);
  return 0;
}
