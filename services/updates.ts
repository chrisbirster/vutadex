import { readPackageInfo } from '../utils/package-info.ts';

const REGISTRY_URL = 'https://registry.npmjs.org';
const REQUEST_TIMEOUT_MS = 3000;
/** Plain releases only; the `latest` tag should never be a prerelease. */
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

export interface UpdateStatus {
  current: string;
  /** `null` when the registry could not be reached or answered something unexpected. */
  latest: string | null;
  updateAvailable: boolean;
}

/** Whether `candidate` is a higher x.y.z than `current`. Anything that is not x.y.z compares as not newer. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const next = VERSION_PATTERN.exec(candidate);
  const now = VERSION_PATTERN.exec(current);
  if (!next || !now) return false;
  for (let part = 1; part <= 3; part++) {
    const difference = Number(next[part]) - Number(now[part]);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

/** Asks the npm registry for the `latest` version of this package; `null` on any failure (offline, timeout, bad reply). */
export async function fetchLatestVersion(packageName = readPackageInfo().name, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await fetchImpl(`${REGISTRY_URL}/${encodeURIComponent(packageName)}/latest`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: 'application/json' }
    });
    if (!response.ok) return null;
    const body = await response.json() as { version?: unknown };
    return typeof body.version === 'string' && VERSION_PATTERN.test(body.version) ? body.version : null;
  } catch {
    return null;
  }
}

/** Compares the installed version with the latest published one. */
export async function checkForUpdate(fetchLatest: () => Promise<string | null> = fetchLatestVersion): Promise<UpdateStatus> {
  const current = readPackageInfo().version;
  const latest = await fetchLatest();
  return { current, latest, updateAvailable: latest !== null && isNewerVersion(latest, current) };
}
