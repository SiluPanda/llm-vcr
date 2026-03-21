import type { CassetteEntry, RecordedRequest, VCRConfig } from './types.js';
import { hashRequest } from './hash.js';

export function matchRequest(
  request: RecordedRequest,
  entries: CassetteEntry[],
  options?: VCRConfig['matching'],
  used?: Set<number>,
): { entry: CassetteEntry; index: number } | null {
  const order = options?.order ?? 'ordered';

  if (order === 'ordered') {
    // Try entries in order, skip already-used indices
    for (let i = 0; i < entries.length; i++) {
      if (used && used.has(i)) continue;
      const score = scoreRequest(request, entries[i]);
      if (score > 0.5) {
        return { entry: entries[i], index: i };
      }
    }
    return null;
  } else {
    // unordered: find best match by score
    let bestScore = 0;
    let bestIndex = -1;
    for (let i = 0; i < entries.length; i++) {
      if (used && used.has(i)) continue;
      const score = scoreRequest(request, entries[i]);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    if (bestScore > 0.5) {
      return { entry: entries[bestIndex], index: bestIndex };
    }
    return null;
  }
}

export function scoreRequest(
  request: RecordedRequest,
  entry: CassetteEntry,
): number {
  const incomingHash = hashRequest(request.body);

  // Exact hash match
  if (incomingHash === entry.metadata.requestHash) {
    return 1.0;
  }

  const incomingModel = request.body['model'];
  const entryModel = entry.request.body['model'];

  // Model must match for partial scoring
  if (incomingModel !== entryModel) {
    return 0.0;
  }

  // Model matches — check message similarity
  const incomingMessages = request.body['messages'];
  const entryMessages = entry.request.body['messages'];

  if (
    incomingMessages !== undefined &&
    entryMessages !== undefined &&
    messagesSimilar(incomingMessages, entryMessages)
  ) {
    return 0.8;
  }

  // Model match only
  return 0.4;
}

function messagesSimilar(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ma = a[i] as Record<string, unknown>;
    const mb = b[i] as Record<string, unknown>;
    if (ma['role'] !== mb['role']) return false;
    const ca = normalizeContent(ma['content']);
    const cb = normalizeContent(mb['content']);
    if (ca !== cb) return false;
  }
  return true;
}

function normalizeContent(content: unknown): string {
  if (typeof content === 'string') return content.trim().toLowerCase();
  return JSON.stringify(content);
}
