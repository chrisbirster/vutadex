import { importImage } from '../../services/media.ts';
import { showUsageInformation } from './utils.ts';

export function runMediaSubcommandAdd(args: string[]): number {
  if (args.length !== 1 || !args[0]) return showUsageInformation();
  const image = importImage(args[0]);
  console.log(`Stored ${image.mime} (${image.bytes} bytes)`);
  console.log(image.reference);
  return 0;
}
