const USAGE = `Usage:
  media add <image-path>
  media inspect <deez-media-reference>`;

export function showUsageInformation(): number {
  console.error(USAGE);
  return 1;
}
