import type { VCRConfig } from './types.js';

const ALWAYS_SCRUB_HEADERS = new Set([
  'authorization',
  'x-api-key',
  'api-key',
]);

export function scrubHeaders(
  headers: Record<string, string>,
  config?: VCRConfig['scrub'],
): Record<string, string> {
  const replacement = config?.replacement ?? '[REDACTED]';
  const envVarMap = config?.envVarMap ?? {};
  const customPatterns = config?.patterns ?? [];

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();

    if (ALWAYS_SCRUB_HEADERS.has(lowerKey)) {
      result[key] = replacement;
      continue;
    }

    let scrubbed = value;

    // Apply envVarMap: replace known env var values with their names
    for (const [envName, envValue] of Object.entries(envVarMap)) {
      if (envValue && scrubbed.includes(envValue)) {
        scrubbed = scrubbed.replace(envValue, `\${${envName}}`);
      }
    }

    // Apply custom patterns
    for (const pattern of customPatterns) {
      scrubbed = scrubbed.replace(pattern, replacement);
    }

    result[key] = scrubbed;
  }
  return result;
}

export function scrubBody(
  body: Record<string, unknown>,
  config?: VCRConfig['scrub'],
): Record<string, unknown> {
  const replacement = config?.replacement ?? '[REDACTED]';
  const customPatterns = config?.patterns ?? [];
  const envVarMap = config?.envVarMap ?? {};

  if (!customPatterns.length && !Object.keys(envVarMap).length) {
    return body;
  }

  return scrubValue(body, customPatterns, replacement, envVarMap) as Record<
    string,
    unknown
  >;
}

function scrubValue(
  value: unknown,
  patterns: RegExp[],
  replacement: string,
  envVarMap: Record<string, string>,
): unknown {
  if (typeof value === 'string') {
    let result = value;
    for (const [envName, envValue] of Object.entries(envVarMap)) {
      if (envValue && result.includes(envValue)) {
        result = result.replace(envValue, `\${${envName}}`);
      }
    }
    for (const pattern of patterns) {
      result = result.replace(pattern, replacement);
    }
    return result;
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, patterns, replacement, envVarMap));
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = scrubValue(v, patterns, replacement, envVarMap);
    }
    return result;
  }
  return value;
}
