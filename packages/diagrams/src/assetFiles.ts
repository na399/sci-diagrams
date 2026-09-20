import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

const MANIFEST_LIMIT = 64 * 1024;
const ASSET_LIMIT = 5 * 1024 * 1024;
const TOTAL_LIMIT = 20 * 1024 * 1024;

async function readBounded(path: string, limit: number): Promise<string> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > limit) {
      throw new RangeError(`Expected a regular file no larger than ${limit} bytes: ${path}`);
    }
    const buffer = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) { break; }
      length += bytesRead;
    }
    if (length > limit) { throw new RangeError(`File exceeds ${limit} bytes: ${path}`); }
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length));
  } finally {
    await file.close();
  }
}

/** Explicit local registry; no URL fetches, executable modules, or paths outside its directory. */
export async function loadSvgAssetFiles(manifestPath: string): Promise<Record<string, string>> {
  const manifest = await realpath(resolve(manifestPath));
  const root = dirname(manifest);
  const parsed: unknown = JSON.parse(await readBounded(manifest, MANIFEST_LIMIT));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('SVG asset registry must be an object mapping asset IDs to relative paths.');
  }
  const entries = Object.entries(parsed);
  if (entries.length > 128) { throw new RangeError('SVG asset registry exceeds 128 entries.'); }
  const result: Record<string, string> = Object.create(null);
  let total = 0;
  for (const [key, value] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(key) || ['constructor', 'prototype', '__proto__'].includes(key)) {
      throw new TypeError(`Invalid SVG asset ID: ${key}`);
    }
    if (typeof value !== 'string' || !value || value.length > 4096 || isAbsolute(value) || /[\\\0]|^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) {
      throw new TypeError(`Asset ${key} requires a local relative path.`);
    }
    const target = await realpath(resolve(root, value));
    const rel = relative(root, target);
    if (rel === '..' || rel.startsWith('../') || isAbsolute(rel)) {
      throw new RangeError(`Asset ${key} resolves outside the registry directory.`);
    }
    const svg = await readBounded(target, ASSET_LIMIT);
    total += Buffer.byteLength(svg);
    if (total > TOTAL_LIMIT) { throw new RangeError('SVG assets exceed 20 MiB in total.'); }
    result[key] = svg;
  }
  return result;
}
