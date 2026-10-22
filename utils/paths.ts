import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { APP_NAME } from '../constants.ts';

export function getDataHome(): string {
  const home = os.homedir();
  switch (process.platform) {
    case 'win32':
      return process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    case 'darwin':
      return path.join(home, 'Library', 'Application Support');
    default:
      return process.env.XDG_DATA_HOME || path.join(home, '.local', 'share');
  }
}

/** Where Vutadex keeps its database and media: `<data home>/vutadex`. */
export function getAppDirectory(): string {
  return path.join(getDataHome(), APP_NAME);
}
