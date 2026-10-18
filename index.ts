import process from 'node:process';
import { help } from './commands/help.ts';
import { runDeckCommand } from './commands/deck.ts';
import { runCardCommand } from './commands/card.ts';
import { runDueCommand } from './commands/due.ts';

export async function main(args: string[]): Promise<number> {
  const [command, subcommand, ...rest] = args;
  switch (command) {
    case undefined:
    case 'help':
    case '-h':
    case '--help':
      help();
      return 0;
    case 'deck':
      return runDeckCommand(subcommand, rest);
    case 'version':
    case '-v':
    case '--version':
      console.log('Vutadex v0.3.0');
      return 0;
    case 'card':
      return runCardCommand(subcommand, rest);
    case 'due':
      return runDueCommand(subcommand === undefined ? [] : [subcommand, ...rest]);
    case 'study':
    case 'stats':
      console.error(`Command not implemented yet: ${command}`);
      return 1;
    default:
      console.error(`Unknown command: ${command}\nRun "vutadex help" for usage.`);
      return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
