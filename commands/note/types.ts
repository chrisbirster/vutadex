import { NOTE_FIELDS } from '../../services/note-types.ts';
import { showUsageInformation } from './utils.ts';

export function runNoteSubcommandTypes(args: string[]): number {
  if (args.length) return showUsageInformation();
  console.table(Object.entries(NOTE_FIELDS).map(([type, fields]) => ({ type, fields: fields.join(', ') })));
  return 0;
}
