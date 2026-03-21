import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import type { Cassette } from './types.js';
import { CassetteCorruptError } from './errors.js';

export function cassettePath(cassettesDir: string, name: string): string {
  const safeName = name.replace(/\//g, '-');
  return join(cassettesDir, safeName + '.json');
}

export function loadCassette(filePath: string): Cassette | null {
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Cassette;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray(parsed.entries)
    ) {
      throw new CassetteCorruptError(filePath);
    }
    return parsed;
  } catch (err) {
    if (err instanceof CassetteCorruptError) throw err;
    throw new CassetteCorruptError(filePath, err);
  }
}

export function saveCassette(filePath: string, cassette: Cassette): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(cassette, null, 2), 'utf-8');
}
