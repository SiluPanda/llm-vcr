import type { Cassette, CassetteEntry, VCRConfig, VCRMode } from './types.js';
import { isLLMProvider, detectProvider } from './provider.js';
import { hashRequest } from './hash.js';
import { matchRequest } from './matcher.js';
import { scrubHeaders, scrubBody } from './scrub.js';
import { CassetteMismatchError } from './errors.js';
import { saveCassette } from './cassette.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let originalFetch: ((url: any, init?: RequestInit) => Promise<Response>) | null = null;

interface InterceptorState {
  cassette: Cassette;
  filePath: string;
  mode: VCRMode;
  config: VCRConfig;
  usedIndices: Set<number>;
  newEntries: CassetteEntry[];
}

const activeInterceptors: Map<string, InterceptorState> = new Map();

export function installInterceptor(
  name: string,
  cassette: Cassette,
  filePath: string,
  config: VCRConfig,
): void {
  const mode = config.mode ?? 'auto';

  activeInterceptors.set(name, {
    cassette,
    filePath,
    mode,
    config,
    usedIndices: new Set(),
    newEntries: [],
  });

  if (originalFetch === null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    originalFetch = (globalThis as any).fetch as typeof originalFetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = patchedFetch;
  }
}

export function uninstallInterceptor(name: string): void {
  const state = activeInterceptors.get(name);
  activeInterceptors.delete(name);

  // Persist new entries if any were recorded
  if (state && state.newEntries.length > 0) {
    const updatedCassette: Cassette = {
      ...state.cassette,
      entries: [...state.cassette.entries, ...state.newEntries],
    };
    saveCassette(state.filePath, updatedCassette);
  }

  if (activeInterceptors.size === 0 && originalFetch !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = originalFetch;
    originalFetch = null;
  }
}

export function getInterceptorState(name: string): InterceptorState | undefined {
  return activeInterceptors.get(name);
}

async function patchedFetch(
  url: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const urlStr = url instanceof Request ? url.url : String(url);

  // Non-LLM requests pass through unchanged
  if (!isLLMProvider(urlStr)) {
    return originalFetch!(url, init);
  }

  // Find the first matching active interceptor (most recently added wins)
  const states = Array.from(activeInterceptors.values()).reverse();
  if (states.length === 0) {
    return originalFetch!(url, init);
  }

  // Parse the request body
  let body: Record<string, unknown> = {};
  const initBody = url instanceof Request ? url.body : init?.body;
  if (initBody) {
    try {
      const bodyText = typeof initBody === 'string'
        ? initBody
        : initBody instanceof Uint8Array
          ? new TextDecoder().decode(initBody)
          : JSON.stringify(initBody);
      body = JSON.parse(bodyText) as Record<string, unknown>;
    } catch {
      // non-JSON body — treat as empty for matching purposes
    }
  }

  const provider = detectProvider(urlStr);
  const method = url instanceof Request ? url.method : (init?.method ?? 'POST');

  // Collect incoming headers
  const rawHeaders: Record<string, string> = {};
  if (url instanceof Request) {
    url.headers.forEach((v, k) => { rawHeaders[k] = v; });
  } else if (init?.headers) {
    const h = init.headers;
    if (h instanceof Headers) {
      h.forEach((v, k) => { rawHeaders[k] = v; });
    } else if (Array.isArray(h)) {
      for (const [k, v] of h) rawHeaders[k] = v;
    } else {
      Object.assign(rawHeaders, h);
    }
  }

  // Use first state for simplicity (last cassette installed)
  const state = states[0];
  const request = buildRecordedRequest(provider, urlStr, method, rawHeaders, body, state.config);

  switch (state.mode) {
    case 'passthrough':
      return originalFetch!(url, init);

    case 'replay': {
      const match = matchRequest(request, state.cassette.entries, state.config.matching, state.usedIndices);
      if (!match) {
        throw new CassetteMismatchError(
          `No matching cassette entry for request to ${urlStr}`,
          request,
        );
      }
      state.usedIndices.add(match.index);
      return buildResponse(match.entry);
    }

    case 'record': {
      const start = Date.now();
      const { response, entry } = await captureResponse(
        urlStr,
        init,
        body,
        provider,
        start,
        request,
        state.config,
      );
      state.newEntries.push(entry);
      return response;
    }

    case 'auto': {
      // Try replay first
      const match = matchRequest(request, state.cassette.entries, state.config.matching, state.usedIndices);
      if (match) {
        state.usedIndices.add(match.index);
        return buildResponse(match.entry);
      }
      // Fall through to record
      const start = Date.now();
      const { response, entry } = await captureResponse(
        urlStr,
        init,
        body,
        provider,
        start,
        request,
        state.config,
      );
      state.newEntries.push(entry);
      return response;
    }

    default:
      return originalFetch!(url, init);
  }
}

function buildRecordedRequest(
  provider: string,
  url: string,
  method: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  config: VCRConfig,
) {
  return {
    provider,
    url,
    method,
    headers: scrubHeaders(headers, config.scrub),
    body: scrubBody(body, config.scrub),
  };
}

export function buildResponse(entry: CassetteEntry): Response {
  const { response } = entry;
  const bodyStr = response.body !== undefined ? JSON.stringify(response.body) : '';
  const headers = new Headers(response.headers);
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return new Response(bodyStr, {
    status: response.status,
    headers,
  });
}

export async function captureResponse(
  url: string,
  init: RequestInit | undefined,
  body: Record<string, unknown>,
  provider: string,
  start: number,
  request: ReturnType<typeof buildRecordedRequest>,
  _config: VCRConfig,
): Promise<{ response: Response; entry: CassetteEntry }> {
  const realResponse = await originalFetch!(url, init);
  const durationMs = Date.now() - start;

  // Clone the response so we can read the body and still return a usable Response
  const cloned = realResponse.clone();
  let responseBody: unknown;
  try {
    responseBody = await cloned.json();
  } catch {
    responseBody = await cloned.text();
  }

  const responseHeaders: Record<string, string> = {};
  realResponse.headers.forEach((v, k) => { responseHeaders[k] = v; });

  const requestHash = hashRequest(body);

  const entry: CassetteEntry = {
    request,
    response: {
      status: realResponse.status,
      headers: responseHeaders,
      body: responseBody,
    },
    metadata: {
      recordedAt: new Date().toISOString(),
      durationMs,
      requestHash,
    },
  };

  // Return a fresh response with the captured body
  const replayResponse = buildResponse(entry);
  return { response: replayResponse, entry };
}
