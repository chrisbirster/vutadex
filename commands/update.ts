import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { checkForUpdate } from '../services/updates.ts';
import type { UpdateStatus } from '../services/updates.ts';
import { readPackageInfo } from '../utils/package-info.ts';
import { createTerminalInteraction } from './terminal.ts';
import type { TerminalInteraction } from './terminal.ts';
import { parseCommandArgs } from './utils.ts';

const USAGE = `Usage:
  update [--yes]

  --yes  Install without asking for confirmation`;

type Installer = (packageName: string) => Pick<SpawnSyncReturns<unknown>, 'status' | 'error'>;

/** Installs the newest release globally with npm. The package name comes from our own package.json, never from the registry reply. */
function installLatestWithNpm(packageName: string) {
  return spawnSync('npm', ['install', '--global', `${packageName}@latest`], {
    stdio: 'inherit',
    shell: process.platform === 'win32' // npm is npm.cmd on Windows
  });
}

export async function runUpdateCommand(
  args: string[],
  terminal: TerminalInteraction = createTerminalInteraction(),
  updateCheck: () => Promise<UpdateStatus> = checkForUpdate,
  install: Installer = installLatestWithNpm
): Promise<number> {
  const parsed = parseCommandArgs(args, ['yes'], 0, 0);
  if (!parsed) {
    console.error(USAGE);
    return 1;
  }

  const status = await updateCheck();
  if (status.latest === null) {
    console.error('Could not reach the npm registry to look for a newer version. Check your connection and try again.');
    return 1;
  }
  if (!status.updateAvailable) {
    console.log(`Vutadex v${status.current} is already the latest version.`);
    return 0;
  }

  console.log(`Vutadex v${status.latest} is available (you have v${status.current}).`);
  if (!parsed.flags.yes) {
    if (!terminal.isTTY) {
      console.error('Updating requires confirmation in a terminal or --yes.');
      return 1;
    }
    if (!await terminal.confirm('Install it now with npm? [y/N] ')) {
      console.log('Update cancelled.');
      return 0;
    }
  }

  const result = install(readPackageInfo().name);
  if (result.error || result.status !== 0) {
    console.error('The update did not finish. You can run it yourself: npm install --global ' + readPackageInfo().name + '@latest');
    return 1;
  }
  console.log(`Updated to v${status.latest}. Your data upgrades automatically the next time you run a command.`);
  return 0;
}
