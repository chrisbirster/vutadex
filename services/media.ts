import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getDataHome } from '../utils/paths.ts';
import { APP_NAME, MAX_IMAGE_BYTES, MEDIA_REFERENCE_PATTERN, MEDIA_REFERENCE_PREFIX } from '../constants.ts';

export class MediaError extends Error { }

function storageDir(): string {
  return path.join(getDataHome(), APP_NAME, 'media');
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Detects the image format from its magic bytes (the file name is never trusted).
 *
 * @returns The MIME type: PNG, JPEG, WebP or GIF.
 * @throws {MediaError} If the bytes are none of those formats.
 */
function detectMimeType(bytes: Buffer): string {
  const isPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (isPng) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  const isWebp = bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (isWebp) return 'image/webp';
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'image/gif';
  throw new MediaError('Only PNG, JPEG, WebP and GIF images are supported.');
}

/**
 * Copies an image into the content-addressed media store, named by its SHA-256.
 * Importing the same bytes twice is a no-op.
 *
 * @returns The reference to put in a note, plus the image's size, type and stored path.
 * @throws {MediaError} If the file is not a regular file of 1 byte to MAX_IMAGE_BYTES, changes
 *   while being read, is not a supported image, or collides with a corrupt stored file.
 */
export function importImage(filename: string): { reference: string; bytes: number; mime: string; path: string } {
  const metadata = fs.lstatSync(filename);
  if (!metadata.isFile() || metadata.size <= 0 || metadata.size > MAX_IMAGE_BYTES) {
    throw new MediaError('Image must be a regular file between 1 byte and 20 MiB.');
  }
  const bytes = fs.readFileSync(filename);
  if (bytes.length !== metadata.size) throw new MediaError('Image changed during import.');
  const mime = detectMimeType(bytes);
  const hash = sha256(bytes);
  const directory = storageDir();
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, hash);
  try {
    fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
    if (sha256(fs.readFileSync(target)) !== hash) throw new MediaError('Existing media file checksum mismatch.');
  }
  return { reference: MEDIA_REFERENCE_PREFIX + hash, bytes: bytes.length, mime, path: target };
}

/**
 * Finds a stored image by its media reference and verifies it against its hash.
 *
 * @throws {MediaError} If the reference is malformed, the image is not in the local
 *   store, or its content no longer matches its hash.
 */
export function locateImage(reference: string): { path: string; bytes: number; mime: string } {
  const hash = MEDIA_REFERENCE_PATTERN.exec(reference)?.[1];
  if (!hash) throw new MediaError('Invalid content-addressed media reference.');
  const storedPath = path.join(storageDir(), hash);
  if (!fs.existsSync(storedPath)) throw new MediaError('Image is not available in the local media store.');
  const bytes = fs.readFileSync(storedPath);
  if (sha256(bytes) !== hash) throw new MediaError('Media content checksum mismatch.');
  return { path: storedPath, bytes: bytes.length, mime: detectMimeType(bytes) };
}
