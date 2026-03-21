# llm-vcr

Record and replay LLM API calls for deterministic testing. Works by patching `globalThis.fetch` to intercept requests to OpenAI, Anthropic, Google, Cohere, Mistral, and Azure OpenAI endpoints.

## Install

```bash
npm install llm-vcr
```

Zero runtime dependencies. Node.js >= 18 required.

## Quick start

```typescript
import { createVCR } from 'llm-vcr';

const vcr = createVCR({ cassettesDir: './cassettes', mode: 'auto' });

await vcr.withCassette('my-test', async () => {
  // Any fetch() calls to LLM providers are intercepted here.
  // First run: records to cassettes/my-test.json
  // Subsequent runs: replays from file — no network required
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer sk-...', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Hi' }] }),
  });
  const data = await response.json();
  console.log(data.choices[0].message.content);
});
```

## Modes

| Mode | Behaviour |
|---|---|
| `auto` | (default) Replay if a matching cassette entry exists; record to cassette otherwise |
| `record` | Always hit the real API and save every response to the cassette |
| `replay` | Only replay from cassette; throw `CassetteMismatchError` if no match found |
| `passthrough` | Pass every request through unchanged; nothing is recorded |

Set a default mode on the VCR instance or override per-cassette:

```typescript
const vcr = createVCR({ cassettesDir: './cassettes', mode: 'replay' });

// override for one cassette
await vcr.withCassette('live-test', fn, { mode: 'passthrough' });
```

## Cassette directory

Cassettes are stored as human-readable JSON files:

```
cassettes/
  my-test.json
  another-test.json
```

Commit cassette files to version control so that CI replays them without network access.

## Sensitive data scrubbing

`Authorization`, `x-api-key`, and `api-key` headers are always scrubbed before writing to disk. Additional scrubbing can be configured:

```typescript
const vcr = createVCR({
  cassettesDir: './cassettes',
  scrub: {
    // Replace custom patterns in headers and body string values
    patterns: [/sk-[a-zA-Z0-9]+/g],
    replacement: '[API_KEY]',
    // Replace env var values with their names
    envVarMap: { OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '' },
  },
});
```

## Request matching

By default, requests are matched in declaration order using a scoring algorithm:

- Exact SHA-256 hash match on `model`, `messages`, `tools`, `temperature`, `top_p`, `max_tokens`, `seed`, `response_format` → score 1.0 (always replays)
- Same `model` + similar `messages` → score 0.8 (replayed)
- Same `model` only → score 0.4 (not replayed)

Use `order: 'unordered'` to pick the best match across all entries regardless of position:

```typescript
const vcr = createVCR({
  cassettesDir: './cassettes',
  matching: { order: 'unordered' },
});
```

## API

### `createVCR(config: VCRConfig)`

Returns a VCR instance with a bound `withCassette()` method.

### `withCassette(name, fn, options?)`

Wraps an async function, intercepting all LLM fetch calls within it.

### Errors

- `CassetteMismatchError` — thrown in `replay` mode when no matching entry is found
- `CassetteNotFoundError` — thrown when a cassette file is expected but missing
- `CassetteCorruptError` — thrown when a cassette file cannot be parsed

## Supported providers

- OpenAI (`api.openai.com/v1/`)
- Azure OpenAI (`.openai.azure.com/openai/deployments/`)
- Anthropic (`api.anthropic.com/v1/`)
- Google Generative AI (`generativelanguage.googleapis.com/`)
- Cohere (`api.cohere.ai/` and `api.cohere.com/`)
- Mistral (`api.mistral.ai/`)
