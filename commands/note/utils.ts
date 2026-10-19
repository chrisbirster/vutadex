import { POSITIVE_INTEGER_PATTERN } from '../../constants.ts';
import { NoteError } from '../../services/note-types.ts';

const USAGE = `Usage:
  note types
  note add <deck-id> <type> <fields...>
  note list <deck-id>
  note show <note-id>
  note edit <note-id> <fields...>
  note delete <note-id> [--yes]`;

export function showUsageInformation(): number {
  console.error(USAGE);
  return 1;
}

export function parseNoteId(raw: string | undefined): number {
  const id = Number(raw);
  if (!raw || !POSITIVE_INTEGER_PATTERN.test(raw) || !Number.isSafeInteger(id)) {
    throw new NoteError('Expected a positive integer note ID.');
  }
  return id;
}
