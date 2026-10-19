import { MediaError } from '../services/media.ts';
import { showUsageInformation } from './media/utils.ts';
import cmds from './media/index.ts';

export function runMediaCommand(subcommand: string | undefined, args: string[]): number {
  if (!subcommand) return showUsageInformation();
  try {
    switch (subcommand) {
      case 'add':
        return cmds.runMediaSubcommandAdd(args);
      case 'inspect':
        return cmds.runMediaSubcommandInspect(args);
      default:
        return showUsageInformation();
    }
  } catch (error) {
    // Unlike the other commands, media also reports plain filesystem errors (e.g. a missing file) as messages.
    if (error instanceof MediaError || error instanceof Error) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}
