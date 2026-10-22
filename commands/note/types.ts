import { NOTE_FIELDS } from '../../services/note-types.ts';
import { parseCommandArgs } from '../utils.ts';
import { showUsageInformation } from './utils.ts';

export function runNoteSubcommandTypes(args: string[]): number {
  if (!parseCommandArgs(args, [], 0, 0)) return showUsageInformation();
  console.table(Object.entries(NOTE_FIELDS).map(([type, fields]) => ({ type, fields: fields.join(', ') })));
  return 0;
}
