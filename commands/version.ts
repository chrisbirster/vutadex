import { readPackageInfo } from '../utils/package-info.ts';

export function handleVersionCommand(): number {
  console.log(`Vutadex v${readPackageInfo().version}`);
  return 0;
}
