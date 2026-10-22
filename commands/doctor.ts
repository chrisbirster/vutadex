import { inspectSetup, setUpApp } from '../services/doctor.ts';
import { checkForUpdate } from '../services/updates.ts';
import type { UpdateStatus } from '../services/updates.ts';
import type { DoctorCheck } from '../models/doctor.ts';
import { getAppDirectory } from '../utils/paths.ts';
import { createTerminalInteraction } from './terminal.ts';
import type { TerminalInteraction } from './terminal.ts';
import { parseCommandArgs } from './utils.ts';

const USAGE = `Usage:
  doctor [--check] [--yes] [--offline]

  --check    Report only; exit 1 if anything needs setup
  --yes      Repair without asking for confirmation
  --offline  Skip the check for a newer Vutadex release`;

function printChecks(checks: DoctorCheck[]): void {
  console.table(checks.map(({ name, status, detail }) => ({ check: name, status, detail })));
}

/** A release check never fails doctor: being offline or behind is information, not damage. */
function describeUpdate(status: UpdateStatus): DoctorCheck {
  if (status.latest === null) {
    return { name: 'Updates', status: 'notice', detail: `v${status.current}; could not reach the registry`, fix: '' };
  }
  if (status.updateAvailable) {
    return { name: 'Updates', status: 'notice', detail: `v${status.latest} is available (you have v${status.current}). Run "vdex update".`, fix: '' };
  }
  return { name: 'Updates', status: 'ok', detail: `v${status.current} is the latest`, fix: '' };
}

export async function runDoctorCommand(
  args: string[],
  terminal: TerminalInteraction = createTerminalInteraction(),
  appDirectory = getAppDirectory(),
  updateCheck: () => Promise<UpdateStatus> = checkForUpdate
): Promise<number> {
  const parsed = parseCommandArgs(args, ['check', 'yes', 'offline'], 0, 0);
  if (!parsed) {
    console.error(USAGE);
    return 1;
  }

  const checks = inspectSetup(appDirectory);
  if (!parsed.flags.offline) checks.push(describeUpdate(await updateCheck()));
  printChecks(checks);
  if (checks.some(item => item.status === 'problem')) {
    console.error('Doctor does not change anything that is already there. Fix the problems above, then run it again.');
    return 1;
  }
  const todo = checks.filter(item => item.status === 'todo');
  if (!todo.length) {
    console.log('Everything is set up.');
    return 0;
  }
  if (parsed.flags.check) {
    console.log('Setup is incomplete. Run "doctor" to finish it.');
    return 1;
  }

  console.log('Setup will:');
  for (const item of todo) console.log(`  - ${item.fix}`);
  if (!parsed.flags.yes) {
    if (!terminal.isTTY) {
      console.error('Setup requires confirmation in a terminal or --yes.');
      return 1;
    }
    if (!await terminal.confirm('Continue? [y/N] ')) {
      console.log('Setup cancelled.');
      return 0;
    }
  }

  setUpApp(appDirectory);
  const after = inspectSetup(appDirectory);
  printChecks(after);
  return after.some(item => item.status === 'todo' || item.status === 'problem') ? 1 : 0;
}
