import { runBackupCommand } from './backup.ts';
import { handleHelpCommand } from './help.ts';
import { handleVersionCommand } from './version.ts';
import { runDeckCommand } from './deck.ts';
import { runCardCommand } from './card.ts';
import { runNoteCommand } from './note.ts';
import { runMediaCommand } from './media.ts';
import { runDueCommand } from './due.ts';
import { runStudyCommand } from './study.ts';
import { runStatsCommand } from './stats.ts';

export default {
  handleHelpCommand,
  runBackupCommand,
  handleVersionCommand,
  runDeckCommand,
  runCardCommand,
  runNoteCommand,
  runMediaCommand,
  runDueCommand,
  runStudyCommand,
  runStatsCommand,
}
