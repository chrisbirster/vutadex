#!/usr/bin/env node
import process from 'node:process';
import commands from './commands/index.ts';

export async function main(args: string[]): Promise<number> {
  const [command, subcommand, ...rest] = args;
  switch (command) {
    case undefined:
    case 'help':
    case '-h':
    case '--help':
      return commands.handleHelpCommand();
    case 'deck':
      return commands.runDeckCommand(subcommand, rest);
    case 'version':
    case '-v':
    case '--version':
      return commands.handleVersionCommand();
    case 'card':
      return commands.runCardCommand(subcommand, rest);
    case 'note':
      return commands.runNoteCommand(subcommand, rest);
    case 'media':
      return commands.runMediaCommand(subcommand, rest);
    case 'due':
      return commands.runDueCommand(subcommand === undefined ? [] : [subcommand, ...rest]);
    case 'study':
      return commands.runStudyCommand(subcommand === undefined ? [] : [subcommand, ...rest]);
    case 'stats':
      return commands.runStatsCommand(subcommand === undefined ? [] : [subcommand, ...rest]);
    default:
      console.error(`Unknown command: ${command}\nRun "vutadex help" for usage.`);
      return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
