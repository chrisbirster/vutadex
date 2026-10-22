import { DatabaseSync } from 'node:sqlite';
import { getNote, retireNote } from '../../services/notes.ts';
import { NoteError } from '../../services/note-types.ts';
import { showUsageInformation, parseNoteId } from './utils.ts';
import { parseCommandArgs } from '../utils.ts';
import { createTerminalInteraction } from '../terminal.ts';
import type { TerminalInteraction } from '../terminal.ts';


export async function runNoteSubcommandDelete(db: DatabaseSync, args: string[], terminal: TerminalInteraction = createTerminalInteraction()): Promise<number> {
  const parsed = parseCommandArgs(args, ['yes'], 1, 1);
  if (!parsed) return showUsageInformation();
  const noteId = parseNoteId(parsed.positionals[0]);
  const note = getNote(db, noteId);
  if (!parsed.flags.yes) {
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
