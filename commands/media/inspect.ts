import { locateImage } from '../../services/media.ts';
import { showUsageInformation } from './utils.ts';

export function runMediaSubcommandInspect(args: string[]): number {
  if (args.length !== 1 || !args[0]) return showUsageInformation();
  const image = locateImage(args[0]);
  console.log(`Stored image: ${image.mime} (${image.bytes} bytes)`);
  console.log(image.path);
  return 0;
}
