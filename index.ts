import process from 'node:process';
import { handleHelpCommand } from './commands/help.ts';
import { handleVersionCommand } from './commands/version.ts';
import { runDeckCommand } from './commands/deck.ts';
import { runCardCommand } from './commands/card.ts';

export async function main(args: string[]): Promise<number> {
  const [command, subcommand, ...rest] = args;
  switch (command) {
    case undefined:
    case 'help':
    case '-h':
    case '--help':
      return handleHelpCommand();
    case 'deck':
      return runDeckCommand(subcommand, rest);
    case 'version':
    case '-v':
    case '--version':
      return handleVersionCommand();
    case 'card':
      return runCardCommand(subcommand, rest);
    case 'study':
    case 'stats':
    case 'due':
      console.error(`Command not implemented yet: ${command}`);
      return 1;
    default:
      console.error(`Unknown command: ${command}\nRun "vutadex help" for usage.`);
      return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
