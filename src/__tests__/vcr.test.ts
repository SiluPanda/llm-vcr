import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { createVCR } from '../vcr.js';
import { hashRequest } from '../hash.js';
import { detectProvider, isLLMProvider } from '../provider.js';
import { scrubHeaders, scrubBody } from '../scrub.js';
import { CassetteMismatchError } from '../errors.js';
import { loadCassette } from '../cassette.js';

// ---- helpers ----------------------------------------------------------------

function makeTempDir(): string {
  const dir = join(tmpdir(), `llm-vcr-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeOpenAIResponse(content = 'Hello from mock') {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const BASE_BODY = {
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello' }],
};

// ---- tests ------------------------------------------------------------------

describe('hashRequest', () => {
  it('produces the same hash for identical bodies', () => {
    const h1 = hashRequest(BASE_BODY);
    const h2 = hashRequest({ ...BASE_BODY });
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different messages', () => {
    const h1 = hashRequest(BASE_BODY);
    const h2 = hashRequest({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Bye' }] });
    expect(h1).not.toBe(h2);
  });

  it('is a 64-char hex SHA-256', () => {
    const h = hashRequest(BASE_BODY);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('detectProvider', () => {
  it('identifies openai URLs', () => {
    expect(detectProvider(OPENAI_URL)).toBe('openai');
  });

  it('identifies anthropic URLs', () => {
    expect(detectProvider(ANTHROPIC_URL)).toBe('anthropic');
  });

  it('returns unknown for unrecognised URLs', () => {
    expect(detectProvider('https://example.com/api')).toBe('unknown');
  });
});

describe('isLLMProvider', () => {
  it('returns true for known providers', () => {
    expect(isLLMProvider(OPENAI_URL)).toBe(true);
    expect(isLLMProvider(ANTHROPIC_URL)).toBe(true);
  });

  it('returns false for unknown URLs', () => {
    expect(isLLMProvider('https://example.com')).toBe(false);
  });
});

describe('scrubHeaders', () => {
  it('redacts Authorization header', () => {
    const result = scrubHeaders({ Authorization: 'Bearer sk-secret123' });
    expect(result['Authorization']).toBe('[REDACTED]');
  });

  it('redacts x-api-key header', () => {
    const result = scrubHeaders({ 'x-api-key': 'mykey' });
    expect(result['x-api-key']).toBe('[REDACTED]');
  });

  it('preserves non-sensitive headers', () => {
    const result = scrubHeaders({ 'content-type': 'application/json' });
    expect(result['content-type']).toBe('application/json');
  });

  it('applies envVarMap substitution', () => {
    const result = scrubHeaders(
      { 'x-custom-header': 'actual-secret-value' },
      { envVarMap: { MY_SECRET: 'actual-secret-value' } },
    );
    expect(result['x-custom-header']).toBe('${MY_SECRET}');
  });

  it('replaces all occurrences of the same secret value', () => {
    const result = scrubHeaders(
      { 'x-tokens': 'tok_abc123 and tok_abc123 again' },
      { envVarMap: { API_TOKEN: 'tok_abc123' } },
    );
    expect(result['x-tokens']).toBe('${API_TOKEN} and ${API_TOKEN} again');
    expect(result['x-tokens']).not.toContain('tok_abc123');
  });
});

describe('withCassette — auto mode (record on first call, replay on second)', () => {
  let cassettesDir: string;

  beforeEach(() => {
    cassettesDir = makeTempDir();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(cassettesDir, { recursive: true, force: true });
  });

  it('records on first call and saves cassette file', async () => {
    const mockBody = makeOpenAIResponse('First response');
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const vcr = createVCR({ cassettesDir, mode: 'auto' });

    await vcr.withCassette('test-record', async () => {
      const resp = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: { Authorization: 'Bearer sk-test', 'content-type': 'application/json' },
        body: JSON.stringify(BASE_BODY),
      });
      const data = await resp.json() as { choices: Array<{ message: { content: string } }> };
      expect(data.choices[0].message.content).toBe('First response');
    });

    // Cassette file should have been saved
    const cassettePath = join(cassettesDir, 'test-record.json');
    expect(existsSync(cassettePath)).toBe(true);

    const cassette = loadCassette(cassettePath);
    expect(cassette).not.toBeNull();
    expect(cassette!.entries).toHaveLength(1);
    expect(cassette!.entries[0].metadata.requestHash).toBeTruthy();
    // Authorization should be scrubbed
    expect(cassette!.entries[0].request.headers['Authorization']).toBe('[REDACTED]');
  });

  it('replays on second call without hitting the network', async () => {
    const mockBody = makeOpenAIResponse('Recorded response');
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const vcr = createVCR({ cassettesDir, mode: 'auto' });

    // First call: records
    await vcr.withCassette('test-replay', async () => {
      await fetch(OPENAI_URL, {
        method: 'POST',
        headers: { Authorization: 'Bearer sk-test', 'content-type': 'application/json' },
        body: JSON.stringify(BASE_BODY),
      });
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call: replays (mock should NOT be called again)
    let replayContent: string | undefined;
    await vcr.withCassette('test-replay', async () => {
      const resp = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(BASE_BODY),
      });
      const data = await resp.json() as { choices: Array<{ message: { content: string } }> };
      replayContent = data.choices[0].message.content;
    });

    expect(mockFetch).toHaveBeenCalledTimes(1); // No new network calls
    expect(replayContent).toBe('Recorded response');
  });
});

describe('withCassette — replay mode throws on no match', () => {
  let cassettesDir: string;

  beforeEach(() => {
    cassettesDir = makeTempDir();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(cassettesDir, { recursive: true, force: true });
  });

  it('throws CassetteMismatchError when no matching entry exists', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const vcr = createVCR({ cassettesDir, mode: 'replay' });

    await expect(
      vcr.withCassette('empty-cassette', async () => {
        await fetch(OPENAI_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(BASE_BODY),
        });
      }),
    ).rejects.toThrow(CassetteMismatchError);
  });
});

describe('withCassette — passthrough mode', () => {
  let cassettesDir: string;

  beforeEach(() => {
    cassettesDir = makeTempDir();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(cassettesDir, { recursive: true, force: true });
  });

  it('calls the original fetch without recording', async () => {
    const mockBody = makeOpenAIResponse('Passthrough response');
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const vcr = createVCR({ cassettesDir, mode: 'passthrough' });

    await vcr.withCassette('passthrough-test', async () => {
      const resp = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(BASE_BODY),
      });
      const data = await resp.json() as { choices: Array<{ message: { content: string } }> };
      expect(data.choices[0].message.content).toBe('Passthrough response');
    });

    // mockFetch was called (passthrough goes to original fetch)
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // No cassette file should be saved
    const cassettePath = join(cassettesDir, 'passthrough-test.json');
    expect(existsSync(cassettePath)).toBe(false);
  });
});

describe('withCassette — non-LLM URLs pass through interceptor transparently', () => {
  let cassettesDir: string;

  beforeEach(() => {
    cassettesDir = makeTempDir();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(cassettesDir, { recursive: true, force: true });
  });

  it('does not intercept non-LLM URLs', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const vcr = createVCR({ cassettesDir, mode: 'replay' });

    await vcr.withCassette('non-llm', async () => {
      const resp = await fetch('https://example.com/api/data');
      const data = await resp.json() as { ok: boolean };
      expect(data.ok).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('captureResponse — non-JSON response body', () => {
  let cassettesDir: string;

  beforeEach(() => {
    cassettesDir = makeTempDir();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(cassettesDir, { recursive: true, force: true });
  });

  it('records plain text response body without data loss', async () => {
    const plainTextBody = 'This is plain text, not JSON';
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(plainTextBody, {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const vcr = createVCR({ cassettesDir, mode: 'record' });

    await vcr.withCassette('text-response', async () => {
      const resp = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(BASE_BODY),
      });
      const text = await resp.text();
      expect(text).toBe(JSON.stringify(plainTextBody));
    });

    const cassettePath = join(cassettesDir, 'text-response.json');
    const cassette = loadCassette(cassettePath);
    expect(cassette).not.toBeNull();
    expect(cassette!.entries).toHaveLength(1);
    expect(cassette!.entries[0].response.body).toBe(plainTextBody);
  });
});

describe('patchedFetch — Request object body extraction', () => {
  let cassettesDir: string;

  beforeEach(() => {
    cassettesDir = makeTempDir();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(cassettesDir, { recursive: true, force: true });
  });

  it('preserves the request body when url is a Request object', async () => {
    const mockBody = makeOpenAIResponse('Request object response');
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const vcr = createVCR({ cassettesDir, mode: 'record' });

    await vcr.withCassette('request-object-body', async () => {
      const request = new Request(OPENAI_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(BASE_BODY),
      });
      const resp = await fetch(request);
      const data = await resp.json() as { choices: Array<{ message: { content: string } }> };
      expect(data.choices[0].message.content).toBe('Request object response');
    });

    const cassettePath = join(cassettesDir, 'request-object-body.json');
    const cassette = loadCassette(cassettePath);
    expect(cassette).not.toBeNull();
    expect(cassette!.entries).toHaveLength(1);
    // The request body should be properly extracted, not "{}" from a ReadableStream
    expect(cassette!.entries[0].request.body).toEqual(BASE_BODY);
  });
});

describe('scrubBody', () => {
  it('replaces all occurrences of env var values in body strings', () => {
    const result = scrubBody(
      { prompt: 'key=secret123 and key=secret123' },
      { envVarMap: { MY_KEY: 'secret123' } },
    );
    expect((result as Record<string, string>).prompt).toBe('key=${MY_KEY} and key=${MY_KEY}');
    expect((result as Record<string, string>).prompt).not.toContain('secret123');
  });
});
