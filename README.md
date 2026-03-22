# llm-vcr

Record and replay LLM API calls for deterministic testing.

[![npm version](https://img.shields.io/npm/v/llm-vcr.svg)](https://www.npmjs.com/package/llm-vcr)
[![license](https://img.shields.io/npm/l/llm-vcr.svg)](https://github.com/SiluPanda/llm-vcr/blob/master/LICENSE)
[![node](https://img.shields.io/node/v/llm-vcr.svg)](https://nodejs.org)

---

## Description

`llm-vcr` intercepts outgoing `fetch` calls to LLM provider APIs, records the full request-response exchange to a JSON "cassette" file on the first run, and replays the recorded response on every subsequent run. This eliminates API costs, network latency, and non-determinism from your test suites.

The library patches `globalThis.fetch` transparently. Any code that calls `fetch` against a supported LLM provider endpoint -- whether through the OpenAI SDK, the Anthropic SDK, or raw HTTP -- is automatically intercepted. Non-LLM requests pass through untouched.

Cassette files are human-readable JSON designed for code review and version control. Sensitive data such as API keys and authorization headers are scrubbed automatically before writing to disk.

Zero runtime dependencies. Node.js >= 18 required.

---

## Installation

```bash
npm install llm-vcr
```

---

## Quick Start

```typescript
import { createVCR } from 'llm-vcr';

const vcr = createVCR({ cassettesDir: './cassettes', mode: 'auto' });

await vcr.withCassette('my-test', async () => {
  // First run: records the real API response to cassettes/my-test.json
  // Subsequent runs: replays from file -- no network required
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer sk-...',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hi' }],
    }),
  });
  const data = await response.json();
  console.log(data.choices[0].message.content);
});
```

---

## Features

- **Record and replay** -- Capture real LLM API responses once, replay them indefinitely with zero cost and zero latency.
- **Automatic fetch interception** -- Patches `globalThis.fetch` transparently. No changes to application code required.
- **Provider-aware matching** -- Matches requests by model, messages, tools, temperature, and other LLM-specific fields rather than raw HTTP bodies.
- **Automatic secret scrubbing** -- `Authorization`, `x-api-key`, and `api-key` headers are always redacted before writing to disk.
- **Configurable scrub patterns** -- Define custom regex patterns and environment variable maps for additional scrubbing.
- **Four recording modes** -- `auto`, `record`, `replay`, and `passthrough` to fit any workflow.
- **Ordered and unordered matching** -- Match cassette entries in declaration order or pick the best match by score.
- **Human-readable cassettes** -- JSON files with clear structure, designed for git diffs and code review.
- **Multi-provider support** -- OpenAI, Azure OpenAI, Anthropic, Google Generative AI, Cohere, and Mistral detected automatically.
- **TypeScript-first** -- Full type definitions for all public APIs, configuration objects, and cassette formats.
- **Zero dependencies** -- Only Node.js built-ins are used at runtime.

---

## API Reference

### `createVCR(config)`

Factory function that returns a VCR instance with project-wide defaults.

```typescript
import { createVCR } from 'llm-vcr';

const vcr = createVCR({
  cassettesDir: './cassettes',
  mode: 'auto',
});
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `config` | `VCRConfig` | Configuration object (see [Configuration](#configuration)) |

**Returns:** `{ withCassette, config }` -- An object with a bound `withCassette` method and the resolved config.

---

### `withCassette(name, fn, options?)`

Wraps an async function, intercepting all LLM `fetch` calls within it. Available both as a standalone export and as a method on the VCR instance returned by `createVCR`.

```typescript
import { withCassette } from 'llm-vcr';

const result = await withCassette('test-name', async () => {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer sk-...', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Hello' }] }),
  });
  return resp.json();
}, { mode: 'auto', config: { cassettesDir: './cassettes' } });
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `name` | `string` | Cassette name. Used as the filename (slashes are replaced with dashes). |
| `fn` | `() => T \| Promise<T>` | The function to execute with LLM interception active. |
| `options?` | `CassetteOptions & { config?: VCRConfig }` | Optional per-cassette overrides for mode and config. |

**Returns:** `Promise<T>` -- The return value of `fn`.

When called via the VCR instance, the `config` parameter is pre-bound:

```typescript
const vcr = createVCR({ cassettesDir: './cassettes', mode: 'auto' });

await vcr.withCassette('test-name', async () => {
  // ...
}, { mode: 'replay' }); // override mode for this cassette only
```

---

### `cassettePath(cassettesDir, name)`

Computes the file path for a cassette given a directory and a name.

```typescript
import { cassettePath } from 'llm-vcr';

const path = cassettePath('./cassettes', 'my-test');
// => './cassettes/my-test.json'

const path2 = cassettePath('./cassettes', 'suite/nested-test');
// => './cassettes/suite-nested-test.json'
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `cassettesDir` | `string` | Directory where cassette files are stored. |
| `name` | `string` | Cassette name. Forward slashes are replaced with dashes. |

**Returns:** `string` -- Absolute or relative path to the `.json` cassette file.

---

### `loadCassette(filePath)`

Loads and parses a cassette file from disk.

```typescript
import { loadCassette } from 'llm-vcr';

const cassette = loadCassette('./cassettes/my-test.json');
if (cassette) {
  console.log(`${cassette.entries.length} recorded entries`);
}
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `filePath` | `string` | Path to the cassette JSON file. |

**Returns:** `Cassette | null` -- The parsed cassette, or `null` if the file does not exist.

**Throws:** `CassetteCorruptError` if the file exists but contains invalid JSON or is missing the `entries` array.

---

### `saveCassette(filePath, cassette)`

Writes a cassette to disk as pretty-printed JSON. Creates parent directories if they do not exist.

```typescript
import { saveCassette } from 'llm-vcr';

saveCassette('./cassettes/my-test.json', {
  version: 1,
  name: 'my-test',
  recordedAt: new Date().toISOString(),
  entries: [],
});
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `filePath` | `string` | Destination path for the cassette file. |
| `cassette` | `Cassette` | The cassette object to serialize. |

**Returns:** `void`

---

### `hashRequest(body)`

Computes a deterministic SHA-256 hash of the semantically relevant fields in an LLM request body. Used internally for request matching.

The following fields are included in the hash: `model`, `messages`, `tools`, `temperature`, `top_p`, `max_tokens`, `seed`, `response_format`. All other fields are ignored. Keys are sorted recursively before hashing.

```typescript
import { hashRequest } from 'llm-vcr';

const hash = hashRequest({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello' }],
});
// => 64-character hex SHA-256 string
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `body` | `Record<string, unknown>` | The request body object. |

**Returns:** `string` -- A 64-character lowercase hex SHA-256 digest.

---

### `normalizeMessages(messages)`

Normalizes an array of LLM messages for consistent comparison. Trims whitespace from `role` and `content` fields and lowercases `role`. Handles both string content and multi-part content arrays.

```typescript
import { normalizeMessages } from 'llm-vcr';

const normalized = normalizeMessages([
  { role: ' User ', content: '  Hello  ' },
]);
// => [{ role: 'user', content: 'Hello' }]
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `messages` | `unknown` | An array of message objects, or any other value (returned as-is if not an array). |

**Returns:** `unknown` -- The normalized messages array, or the input unchanged if it is not an array.

---

### `matchRequest(request, entries, options?, used?)`

Finds a matching cassette entry for an incoming request using the scoring algorithm.

```typescript
import { matchRequest } from 'llm-vcr';

const match = matchRequest(request, cassette.entries, { order: 'ordered' });
if (match) {
  console.log(`Matched entry at index ${match.index}`);
}
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `request` | `RecordedRequest` | The incoming request to match. |
| `entries` | `CassetteEntry[]` | The cassette entries to search. |
| `options?` | `VCRConfig['matching']` | Matching options (`strategy`, `order`). |
| `used?` | `Set<number>` | Set of entry indices already consumed (skipped during matching). |

**Returns:** `{ entry: CassetteEntry; index: number } | null` -- The best matching entry and its index, or `null` if no entry scores above 0.5.

**Matching behavior by `order`:**

| Order | Behavior |
|---|---|
| `'ordered'` (default) | Returns the first entry that scores above 0.5, checked in declaration order. |
| `'unordered'` | Returns the entry with the highest score across all entries, provided it exceeds 0.5. |

---

### `scoreRequest(request, entry)`

Computes a similarity score between an incoming request and a cassette entry.

```typescript
import { scoreRequest } from 'llm-vcr';

const score = scoreRequest(request, entry);
// 1.0 = exact hash match
// 0.8 = same model + similar messages
// 0.4 = same model only
// 0.0 = different model
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `request` | `RecordedRequest` | The incoming request. |
| `entry` | `CassetteEntry` | The cassette entry to compare against. |

**Returns:** `number` -- A score between 0.0 and 1.0.

**Scoring rules:**

| Condition | Score |
|---|---|
| Exact SHA-256 hash match on `model`, `messages`, `tools`, `temperature`, `top_p`, `max_tokens`, `seed`, `response_format` | 1.0 |
| Same `model` and messages match (same roles and content after normalization) | 0.8 |
| Same `model` only | 0.4 |
| Different `model` | 0.0 |

---

### `scrubHeaders(headers, config?)`

Removes sensitive values from request headers. `Authorization`, `x-api-key`, and `api-key` headers are always replaced with `[REDACTED]`. Additional patterns and environment variable substitutions can be configured.

```typescript
import { scrubHeaders } from 'llm-vcr';

const clean = scrubHeaders({
  Authorization: 'Bearer sk-secret123',
  'content-type': 'application/json',
});
// => { Authorization: '[REDACTED]', 'content-type': 'application/json' }
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `headers` | `Record<string, string>` | The headers to scrub. |
| `config?` | `VCRConfig['scrub']` | Optional scrub configuration for custom patterns, replacement string, and env var map. |

**Returns:** `Record<string, string>` -- A new headers object with sensitive values replaced.

---

### `scrubBody(body, config?)`

Removes sensitive values from a request body by applying custom regex patterns and environment variable substitutions. If no custom patterns or env var mappings are configured, the body is returned unchanged.

```typescript
import { scrubBody } from 'llm-vcr';

const clean = scrubBody(
  { prompt: 'Use key sk-abc123 to authenticate' },
  { patterns: [/sk-[a-zA-Z0-9]+/g], replacement: '[KEY]' },
);
// => { prompt: 'Use key [KEY] to authenticate' }
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `body` | `Record<string, unknown>` | The request body to scrub. |
| `config?` | `VCRConfig['scrub']` | Optional scrub configuration. |

**Returns:** `Record<string, unknown>` -- The scrubbed body object. Returns the original object if no patterns or env var mappings are configured.

---

### `detectProvider(url)`

Identifies which LLM provider a URL belongs to based on known endpoint patterns.

```typescript
import { detectProvider } from 'llm-vcr';

detectProvider('https://api.openai.com/v1/chat/completions');
// => 'openai'

detectProvider('https://api.anthropic.com/v1/messages');
// => 'anthropic'

detectProvider('https://example.com/api');
// => 'unknown'
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `url` | `string` | The request URL to check. |

**Returns:** `string` -- One of `'openai'`, `'azure-openai'`, `'anthropic'`, `'google'`, `'cohere'`, `'mistral'`, or `'unknown'`.

---

### `isLLMProvider(url)`

Returns whether a URL matches any known LLM provider endpoint. Used internally to decide whether a `fetch` call should be intercepted.

```typescript
import { isLLMProvider } from 'llm-vcr';

isLLMProvider('https://api.openai.com/v1/chat/completions');
// => true

isLLMProvider('https://example.com/api');
// => false
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `url` | `string` | The request URL to check. |

**Returns:** `boolean`

---

## Configuration

### `VCRConfig`

```typescript
interface VCRConfig {
  cassettesDir: string;
  mode?: VCRMode;
  scrub?: {
    patterns?: RegExp[];
    replacement?: string;
    envVarMap?: Record<string, string>;
  };
  matching?: {
    strategy?: 'default' | 'normalized';
    order?: 'ordered' | 'unordered';
  };
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `cassettesDir` | `string` | (required) | Directory where cassette JSON files are stored. |
| `mode` | `VCRMode` | `'auto'` | Default recording mode for all cassettes. |
| `scrub.patterns` | `RegExp[]` | `[]` | Custom regex patterns to apply to headers and body string values. |
| `scrub.replacement` | `string` | `'[REDACTED]'` | Replacement string for scrubbed values. |
| `scrub.envVarMap` | `Record<string, string>` | `{}` | Map of environment variable names to their values. Occurrences of the value are replaced with `${ENV_NAME}` in cassette files. |
| `matching.strategy` | `'default' \| 'normalized'` | `'default'` | Matching strategy for request comparison. |
| `matching.order` | `'ordered' \| 'unordered'` | `'ordered'` | Whether entries are matched in order or by best score. |

### `VCRMode`

```typescript
type VCRMode = 'record' | 'replay' | 'auto' | 'passthrough';
```

| Mode | Behavior |
|---|---|
| `auto` | Replay if a matching cassette entry exists; record otherwise. |
| `record` | Always call the real API and save the response to the cassette. |
| `replay` | Only replay from cassette. Throws `CassetteMismatchError` if no match is found. |
| `passthrough` | Pass every request through unchanged. Nothing is recorded or replayed. |

### `CassetteOptions`

Per-cassette overrides passed to `withCassette`.

```typescript
interface CassetteOptions {
  mode?: VCRMode;
}
```

---

## Error Handling

`llm-vcr` exports three error classes, all extending the built-in `Error`.

### `CassetteMismatchError`

Thrown in `replay` mode (or `auto` mode when no match is found and recording is not enabled) when an outgoing LLM request does not match any entry in the cassette.

```typescript
import { CassetteMismatchError } from 'llm-vcr';

try {
  await vcr.withCassette('my-test', async () => {
    await fetch('https://api.openai.com/v1/chat/completions', { /* ... */ });
  });
} catch (err) {
  if (err instanceof CassetteMismatchError) {
    console.error('No matching entry for:', err.request.url);
    console.error('Model:', err.request.body.model);
  }
}
```

**Properties:**

| Property | Type | Description |
|---|---|---|
| `name` | `string` | `'CassetteMismatchError'` |
| `message` | `string` | Describes the unmatched request URL. |
| `request` | `RecordedRequest` | The outgoing request that failed to match. |

### `CassetteNotFoundError`

Thrown when a cassette file is expected but does not exist on disk.

```typescript
import { CassetteNotFoundError } from 'llm-vcr';
```

**Properties:**

| Property | Type | Description |
|---|---|---|
| `name` | `string` | `'CassetteNotFoundError'` |
| `cassetteName` | `string` | The logical cassette name. |
| `filePath` | `string` | The resolved file path that was not found. |

### `CassetteCorruptError`

Thrown when a cassette file exists but contains invalid JSON or is missing the required `entries` array.

```typescript
import { CassetteCorruptError } from 'llm-vcr';
```

**Properties:**

| Property | Type | Description |
|---|---|---|
| `name` | `string` | `'CassetteCorruptError'` |
| `filePath` | `string` | The path to the corrupt file. |
| `cause` | `Error \| undefined` | The underlying parse error, if any. |

---

## Advanced Usage

### Environment Variable Scrubbing

Replace environment variable values in cassette files with their variable names. This keeps cassettes portable across machines and safe for version control.

```typescript
const vcr = createVCR({
  cassettesDir: './cassettes',
  scrub: {
    envVarMap: {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
    },
  },
});
```

In recorded cassettes, occurrences of the actual API key value are replaced with `${OPENAI_API_KEY}` and `${ANTHROPIC_API_KEY}`.

### Custom Scrub Patterns

Define regex patterns to redact application-specific secrets from both headers and body values.

```typescript
const vcr = createVCR({
  cassettesDir: './cassettes',
  scrub: {
    patterns: [/sk-[a-zA-Z0-9]+/g, /ghp_[a-zA-Z0-9]+/g],
    replacement: '[SECRET]',
  },
});
```

### Unordered Matching

By default, cassette entries are matched in the order they were recorded. If your tests make LLM calls in a non-deterministic order (for example, concurrent requests), use unordered matching to pick the best match by score regardless of position.

```typescript
const vcr = createVCR({
  cassettesDir: './cassettes',
  matching: { order: 'unordered' },
});
```

### Per-Cassette Mode Override

Set a project-wide default mode and override it for specific cassettes.

```typescript
const vcr = createVCR({ cassettesDir: './cassettes', mode: 'replay' });

// This cassette always hits the real API
await vcr.withCassette('live-smoke-test', fn, { mode: 'passthrough' });

// This cassette re-records fresh responses
await vcr.withCassette('updated-prompt', fn, { mode: 'record' });
```

### CI/CD Replay-Only Mode

In CI environments, set mode to `replay` so that tests fail fast if a cassette is missing or outdated, rather than silently making real API calls.

```typescript
const vcr = createVCR({
  cassettesDir: './cassettes',
  mode: process.env.CI ? 'replay' : 'auto',
});
```

### Using the Standalone `withCassette`

If you do not need a shared VCR instance, use the standalone `withCassette` function directly.

```typescript
import { withCassette } from 'llm-vcr';

await withCassette('one-off-test', async () => {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': 'sk-ant-...', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Hello' }],
    }),
  });
  return resp.json();
}, { config: { cassettesDir: './cassettes' } });
```

### Cassette File Structure

Cassette files are stored as pretty-printed JSON. A typical cassette looks like this:

```json
{
  "version": 1,
  "name": "my-test",
  "recordedAt": "2025-01-15T10:30:00.000Z",
  "entries": [
    {
      "request": {
        "provider": "openai",
        "url": "https://api.openai.com/v1/chat/completions",
        "method": "POST",
        "headers": {
          "Authorization": "[REDACTED]",
          "content-type": "application/json"
        },
        "body": {
          "model": "gpt-4o-mini",
          "messages": [{ "role": "user", "content": "Hello" }]
        }
      },
      "response": {
        "status": 200,
        "headers": { "content-type": "application/json" },
        "body": {
          "id": "chatcmpl-abc123",
          "choices": [{ "message": { "role": "assistant", "content": "Hi!" } }]
        }
      },
      "metadata": {
        "recordedAt": "2025-01-15T10:30:00.123Z",
        "durationMs": 450,
        "requestHash": "a1b2c3d4..."
      }
    }
  ]
}
```

Commit cassette files to version control. Review diffs when prompts, models, or expected behavior change.

---

## TypeScript

`llm-vcr` is written in TypeScript and ships type declarations alongside the compiled JavaScript. All public types are exported from the package entry point.

```typescript
import type {
  VCRMode,
  VCRConfig,
  CassetteEntry,
  RecordedRequest,
  RecordedResponse,
  EntryMetadata,
  Cassette,
  CassetteOptions,
} from 'llm-vcr';
```

### Type Definitions

```typescript
type VCRMode = 'record' | 'replay' | 'auto' | 'passthrough';

interface VCRConfig {
  cassettesDir: string;
  mode?: VCRMode;
  scrub?: {
    patterns?: RegExp[];
    replacement?: string;
    envVarMap?: Record<string, string>;
  };
  matching?: {
    strategy?: 'default' | 'normalized';
    order?: 'ordered' | 'unordered';
  };
}

interface Cassette {
  version: number;
  name: string;
  recordedAt: string;
  entries: CassetteEntry[];
}

interface CassetteEntry {
  request: RecordedRequest;
  response: RecordedResponse;
  metadata: EntryMetadata;
}

interface RecordedRequest {
  provider: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

interface RecordedResponse {
  status: number;
  headers: Record<string, string>;
  body?: unknown;
  streaming?: boolean;
  chunks?: Array<{ data: string; timestamp: number }>;
}

interface EntryMetadata {
  recordedAt: string;
  durationMs: number;
  requestHash: string;
}

interface CassetteOptions {
  mode?: VCRMode;
}
```

---

## Supported Providers

| Provider | URL Pattern |
|---|---|
| OpenAI | `api.openai.com/v1/` |
| Azure OpenAI | `.openai.azure.com/openai/deployments/` |
| Anthropic | `api.anthropic.com/v1/` |
| Google Generative AI | `generativelanguage.googleapis.com/` |
| Cohere | `api.cohere.ai/` and `api.cohere.com/` |
| Mistral | `api.mistral.ai/` |

Requests to any other URL are passed through the interceptor without recording or replay.

---

## License

MIT
