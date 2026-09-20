import { existsSync, realpathSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { CliError } from './errors.js';

function canonical(path: string): string {
  return existsSync(path) ? realpathSync(path) : resolve(path);
}

/** Check the entire batch before any writes, including collisions between different inputs. */
export function planOutputs(
  specs: readonly string[], format: string, outDir: string, outFlag?: string,
): Map<string, string> {
  if (outFlag !== undefined && specs.length !== 1) {
    throw new CliError('--out takes exactly one input; use --out-dir to render several.');
  }
  const sources = new Set(specs.filter((spec) => spec !== '-').map(canonical));
  const targets = new Set<string>();
  const result = new Map<string, string>();
  for (const spec of specs) {
    const target = outFlag === '-' ? '-' : outFlag !== undefined ? resolve(outFlag)
      : join(outDir, `${spec === '-' ? 'diagram' : basename(spec, extname(spec))}.${format}`);
    const key = target === '-' ? '-' : canonical(target);
    if (sources.has(key)) { throw new CliError('Refusing to overwrite a source document.'); }
    if (targets.has(key)) { throw new CliError(`Multiple inputs resolve to output ${target}.`); }
    targets.add(key); result.set(spec, target);
  }
  return result;
}

/** Per-file atomic replacement. A batch is preflighted but is not a filesystem transaction. */
export async function writeArtifact(target: string, data: string | Buffer): Promise<void> {
  if (target === '-') {
    await new Promise<void>((resolveWrite, reject) => {
      process.stdout.write(data, (error) => error ? reject(error) : resolveWrite());
    });
    return;
  }
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, data, { flag: 'wx' });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}
