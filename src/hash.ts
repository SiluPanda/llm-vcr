import { createHash } from 'crypto';

const HASH_FIELDS = [
  'model',
  'messages',
  'tools',
  'temperature',
  'top_p',
  'max_tokens',
  'seed',
  'response_format',
] as const;

export function hashRequest(body: Record<string, unknown>): string {
  const relevant: Record<string, unknown> = {};
  for (const field of HASH_FIELDS) {
    if (field in body) {
      relevant[field] = body[field];
    }
  }
  const sorted = sortKeys(relevant);
  const json = JSON.stringify(sorted);
  return createHash('sha256').update(json).digest('hex');
}

export function normalizeMessages(messages: unknown): unknown {
  if (!Array.isArray(messages)) return messages;
  return messages.map((msg: unknown) => {
    if (typeof msg !== 'object' || msg === null) return msg;
    const m = msg as Record<string, unknown>;
    const result: Record<string, unknown> = { ...m };
    if (typeof result['role'] === 'string') {
      result['role'] = result['role'].toLowerCase().trim();
    }
    if (typeof result['content'] === 'string') {
      result['content'] = result['content'].trim();
    } else if (Array.isArray(result['content'])) {
      result['content'] = result['content'].map((part: unknown) => {
        if (typeof part !== 'object' || part === null) return part;
        const p = part as Record<string, unknown>;
        if (typeof p['text'] === 'string') {
          return { ...p, text: p['text'].trim() };
        }
        return p;
      });
    }
    return result;
  });
}

function sortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj !== null && typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}
