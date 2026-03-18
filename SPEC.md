# llm-vcr -- Specification

## 1. Overview

`llm-vcr` is a record-and-replay library for LLM API calls that provides deterministic, zero-cost testing of AI-powered applications. It intercepts calls to LLM providers (OpenAI, Anthropic, Google, and any fetch-based API), records the full request-response exchange to a "cassette" file on the first run, and replays the recorded response on subsequent runs -- eliminating API costs, network latency, and non-determinism from test suites. It is nock for AI: the VCR (Video Cassette Recorder) pattern, purpose-built for the specific challenges of LLM APIs.

The gap this package fills is specific and well-validated. The VCR testing pattern originated with Ruby's VCR gem and has been ported to every major ecosystem: Python has VCR.py, JavaScript has nock and Polly.js for HTTP-level recording. These tools intercept raw HTTP requests, record them to fixture files, and replay them. They work for any HTTP API, but they are unaware of LLM-specific concerns. When applied to LLM testing, they have four critical limitations:

1. **Streaming responses**: LLM providers deliver responses as Server-Sent Events (SSE) streams. HTTP-level recorders like nock capture the raw HTTP response body, but they do not understand SSE chunking, cannot replay chunks with realistic timing, and cannot handle the OpenAI/Anthropic streaming wire formats (each with different chunk structures, finish signals, and usage reporting). A developer using nock to record a streaming OpenAI call gets a blob of concatenated SSE frames that cannot be replayed as a stream.

2. **Request matching**: LLM requests contain both semantically important fields (model, messages, temperature, tools) and ephemeral fields (API keys, request IDs, timestamps, SDK metadata headers). HTTP-level matchers match on URL + method + headers + body, requiring exact body matches that break when the SDK adds a new header or the request ID changes. LLM-aware matching needs to match on the prompt content and model parameters while ignoring authentication and metadata.

3. **Sensitive data**: Every LLM request carries an API key in the Authorization header. HTTP-level recorders capture this key verbatim and write it to a cassette file that gets committed to git. VCR.py has a `filter_headers` mechanism, but it requires manual configuration for each sensitive field. LLM-aware recording should auto-scrub API keys, auth tokens, and other secrets by default.

4. **Multi-provider normalization**: OpenAI, Anthropic, and Google each have different API formats, endpoint URLs, authentication schemes, streaming protocols, and response shapes. HTTP-level recorders treat them all as opaque HTTP -- the cassette for an OpenAI call looks nothing like the cassette for an Anthropic call, even though they represent the same logical operation (send messages, get completion). LLM-aware recording can normalize across providers, making cassettes more readable and enabling provider-migration testing.

Existing JavaScript tools address adjacent problems but not this one. `nock` intercepts `http.request` and replays HTTP responses, but has no streaming awareness, no LLM request matching, and no auto-scrubbing. `msw` (Mock Service Worker) intercepts fetch and provides request handlers, but it is a mocking framework, not a recorder -- developers must write mock responses by hand. `@copilotkit/llmock` provides hand-written LLM fixtures but does not record real API calls. Polly.js records HTTP interactions with adapters for fetch and XHR, but has the same streaming and matching limitations as nock. `prompt-snap` in this monorepo provides snapshot testing for LLM outputs but does not intercept or record API calls -- it compares output values, not request-response pairs.

`llm-vcr` provides the missing primitive: automatic interception, recording, and replay of LLM API calls with first-class support for streaming, provider-aware request matching, sensitive data scrubbing, and cassette files designed for human review and git storage. The workflow mirrors VCR.py: wrap a test in `withCassette('test-name', async () => { ... })`, run it once to record real API calls, commit the cassette file, and every subsequent run replays instantly from the cassette with deterministic output and zero API cost.

---

## 2. Goals and Non-Goals

### Goals

- Provide a `withCassette(name, fn, options?)` function that wraps an async function with automatic LLM call recording and replay. First call records to a cassette file; subsequent calls replay from it.
- Provide a `createVCR(config)` factory that returns a configured `LLMVcr` instance with project-wide defaults for cassette directory, recording mode, scrub patterns, and provider configuration.
- Support four recording modes: `record` (always call real API, overwrite cassette), `replay` (always use cassette, error if no match), `auto` (replay if cassette exists, record if not), and `passthrough` (no interception).
- Intercept LLM calls at two levels: **SDK-level** (wrap OpenAI/Anthropic client methods directly) and **HTTP-level** (intercept `globalThis.fetch` and `http.request` for provider-agnostic recording).
- Support streaming responses (SSE): record the full chunk sequence with inter-chunk timing data, replay chunks with configurable speed (real-time, fast-forward, or instant).
- Support provider-specific recording for OpenAI (chat completions, streaming, tool calls, structured outputs), Anthropic (messages API, streaming, tool use), and generic fetch-based APIs.
- Match recorded requests using LLM-aware criteria: model name, message content, temperature, tools, and system prompt -- ignoring API keys, request IDs, timestamps, and SDK metadata.
- Auto-scrub sensitive data from cassette files: API keys from Authorization headers, bearer tokens, and configurable additional patterns. Cassette files are safe to commit to git by default.
- Store cassettes as human-readable JSON files with clear structure: request metadata, response content, token usage, streaming chunks, and timing data. Designed for code review and git diff.
- Provide test framework integration for Jest, Vitest, and Mocha: `beforeEach`/`afterEach` helpers, automatic cassette naming from test names, and `--update-cassettes` flag.
- Provide a CLI (`llm-vcr`) for cassette management: list cassettes, inspect contents, clean stale cassettes, re-record specific cassettes, and validate cassette integrity.
- Provide TypeScript type definitions for all public APIs, cassette formats, and configuration objects.
- Keep runtime dependencies at zero beyond Node.js built-ins. Provider SDK interception is implemented via method wrapping and fetch patching, not by depending on provider SDKs.

### Non-Goals

- **Not an LLM client library.** This package does not call LLMs, construct prompts, manage conversations, or provide chat abstractions. It intercepts and records calls made by existing client code. For LLM client functionality, use the OpenAI SDK, Anthropic SDK, or LangChain.
- **Not a mock server.** This package does not run an HTTP server that serves canned responses. It intercepts outgoing requests in-process. For mock HTTP servers, use `msw` or `nock`. For mock MCP servers, use `mcp-server-mock` from this monorepo.
- **Not a prompt testing framework.** This package records and replays API calls; it does not evaluate the quality of LLM outputs. For output evaluation, use `prompt-snap`, `output-grade`, or `rag-eval-node-ts` from this monorepo.
- **Not a cost tracking tool.** This package records token usage metadata in cassettes as a side effect of recording full responses, but cost analysis, budgeting, and reporting are not its purpose. For cost tracking, use `llm-cost-per-test` from this monorepo.
- **Not a proxy server.** This package runs in-process alongside the test code. It does not sit between a client and server as a network proxy. This means it works only in the same Node.js process as the code under test.
- **Not an HTTP recording library.** While this package intercepts HTTP calls, it is specialized for LLM APIs. It does not aim to record arbitrary HTTP traffic. For general HTTP recording, use nock or Polly.js.
- **Not a data masking library.** Auto-scrubbing covers API keys and auth headers by default with configurable patterns. Comprehensive PII detection, field-level encryption, or compliance-grade data masking are out of scope.

---

## 3. Target Users and Use Cases

### AI Application Developers Writing Unit Tests

Developers building applications that call OpenAI, Anthropic, or other LLM APIs need deterministic tests that do not depend on live API access. They wrap each test in `withCassette()`, run the test suite once to record real responses, commit the cassette files, and from that point forward the test suite runs instantly without API keys, network access, or cost. When the application's prompts change, they re-record the affected cassettes and review the diffs in code review.

### CI/CD Pipeline Testing Without API Keys

Teams running AI application tests in CI need builds that do not require LLM provider API keys as CI secrets. With cassettes committed to the repository, CI runs in `replay` mode -- every test reads from cassette files, no API calls are made, and no secrets are needed. The build is fast (no network round-trips), deterministic (same cassette produces same output every test run), and free (no API token consumption).

### Teams Controlling LLM Testing Costs

LLM API calls cost money. A test suite with 200 test cases calling GPT-4 costs dollars per run. During development, engineers might run the suite dozens of times per day. `llm-vcr` eliminates this cost entirely after the initial recording: real API calls are made once, recorded to cassettes, and every subsequent run is free. Re-recording happens only when prompts, models, or expected behavior change.

### Prompt Engineers Iterating on Prompts

Prompt engineers change prompts frequently and need to see how output changes. They record a baseline cassette, then switch to `record` mode when testing a new prompt, recording a fresh cassette. Comparing the old and new cassette files (via git diff or the CLI inspect command) shows exactly how the API response changed: different content, different token usage, different tool calls. This is faster and cheaper than making live API calls for every iteration.

### Teams Testing Streaming Behavior

Applications that stream LLM responses to users (typing indicators, progressive rendering, real-time tool call execution) need tests that exercise the streaming code path. `llm-vcr` records the full SSE chunk sequence with timing data and replays it as a real stream, allowing tests to verify chunk-by-chunk processing, partial response handling, and stream error recovery.

### Teams Migrating Between LLM Providers

When migrating from OpenAI to Anthropic (or vice versa), teams need to verify that their application handles the new provider's response format correctly. They record cassettes from the new provider's API, inspect the response structure, and run their existing tests against the recorded data. The cassette file serves as documentation of the provider's actual response format.

---

## 4. Core Concepts

### Cassette

A cassette is a JSON file that stores one or more recorded LLM API interactions. The name comes from VCR.py's terminology (itself a reference to VHS cassette tapes): a cassette is a reusable recording that can be played back. Each cassette file corresponds to one test (or one logical group of API calls) and contains an ordered list of request-response pairs called entries.

Cassette files are stored in a configurable directory (default: `__cassettes__` alongside the test file), are human-readable JSON designed for code review, and are intended to be committed to version control. When a test runs in replay mode, the cassette file is the single source of truth for what the LLM "said."

A cassette file has a lifecycle:
1. **Created**: On first run (or in `record` mode), the cassette file is written to disk after the test completes.
2. **Replayed**: On subsequent runs (or in `replay` mode), the cassette file is read and its entries are matched against outgoing requests.
3. **Updated**: When prompts or models change, the developer re-records the cassette (via `record` mode or `--update-cassettes`).
4. **Deleted**: When a test is removed, the cassette becomes stale and can be cleaned up via the CLI.

### Entry

An entry is a single recorded request-response pair within a cassette. It captures everything needed to replay the interaction:

- **Request**: The outgoing LLM API request -- provider, endpoint, model, messages, temperature, tools, and other parameters. Sensitive fields (API keys, auth tokens) are scrubbed before storage.
- **Response**: The incoming LLM API response -- content, finish reason, token usage, tool calls, and any other response fields. For streaming responses, this includes the full sequence of SSE chunks.
- **Metadata**: Timestamp of the recording, response duration, and optional cost estimate.

Entries within a cassette are ordered. By default, replay matches entries in order: the first outgoing request matches the first entry, the second request matches the second entry, and so on. Unordered matching (best-match by request content) is available as a configuration option.

### Recording Mode

The recording mode determines how `llm-vcr` behaves when an LLM call is made during a test:

- **`record`**: Always call the real API. Write the response to the cassette, overwriting any existing cassette file. Used when intentionally re-recording.
- **`replay`**: Always read from the cassette. If no matching entry is found, throw an error. Used in CI where no API calls should be made.
- **`auto`**: If a cassette file exists, replay from it. If no cassette file exists, record to a new one. If the cassette exists but does not have a matching entry for a request, record the new interaction and append it to the cassette. This is the default mode for local development.
- **`passthrough`**: Do not intercept LLM calls at all. Requests go directly to the real API with no recording or replay. Used to temporarily disable `llm-vcr` without removing it from test code.

Mode can be set globally (via `createVCR` config or `LLM_VCR_MODE` environment variable), per-cassette (via `withCassette` options), or per-test (via test framework helpers).

### Interception

Interception is the mechanism by which `llm-vcr` captures outgoing LLM requests and injects recorded responses. Two interception strategies are supported:

- **HTTP-level interception**: Patches `globalThis.fetch` (and optionally `http.request`/`https.request`) to intercept all outgoing HTTP requests that match LLM provider URL patterns. This is provider-agnostic -- any HTTP-based LLM API is captured automatically. This is the default strategy.
- **SDK-level interception**: Wraps specific methods on LLM provider SDK client objects (e.g., `openai.chat.completions.create`, `anthropic.messages.create`). This gives access to typed request and response objects without parsing HTTP, but requires the caller to pass the SDK client to `llm-vcr`.

Both strategies are transparent to the code under test: the application calls the LLM SDK normally and receives normal-looking responses (or streams). It does not know that `llm-vcr` is intercepting.

### Request Matching

When replaying from a cassette, `llm-vcr` must determine which recorded entry corresponds to each outgoing request. Request matching is LLM-aware: it compares the semantically meaningful parts of the request (model, messages, parameters) while ignoring ephemeral parts (API keys, request IDs, timestamps, SDK version headers).

The default matching strategy compares:
- Model name (exact match)
- Messages array (content and role, ignoring whitespace normalization)
- Temperature, top_p, max_tokens (exact match if present in both request and entry)
- Tools/functions (name and schema match, ignoring description whitespace)

Fields explicitly ignored by default:
- Authorization / API key headers
- Request ID headers (e.g., `x-request-id`)
- User-agent and SDK version headers
- Timestamp fields

Custom matchers can be provided for specialized matching logic.

### Sensitive Data Scrubbing

Cassette files are designed to be committed to git. By default, `llm-vcr` scrubs sensitive data before writing a cassette:

- `Authorization` header values are replaced with `[SCRUBBED]`
- `api-key` and `x-api-key` header values are replaced with `[SCRUBBED]`
- Any field whose key matches configurable patterns (e.g., `/api[_-]?key/i`, `/secret/i`, `/token/i`) is replaced with `[SCRUBBED]`
- Environment variable references can be substituted: a real API key value is replaced with `${OPENAI_API_KEY}` in the cassette, and on replay the environment variable is not needed (the value is ignored during matching).

Scrubbing happens at write time. The in-memory representation during recording contains the real values (needed to make the actual API call). Only the serialized cassette file is scrubbed.

---

## 5. Recording Modes

### `record` Mode

In `record` mode, every LLM call is forwarded to the real API. The response is captured and written to the cassette file. If a cassette file already exists for this name, it is overwritten entirely.

**Behavior**:
1. Outgoing LLM request is intercepted.
2. Request is forwarded to the real LLM API.
3. Response is received (buffered if streaming).
4. Request-response pair is stored in memory as a cassette entry.
5. When `withCassette` completes (or `vcr.eject()` is called), all entries are serialized to the cassette file. Sensitive data is scrubbed during serialization.

**When to use**: Re-recording cassettes after prompt changes, model upgrades, or when first creating cassettes for new tests. Requires a valid API key and network access.

**Error handling**: If the real API call fails (network error, auth error, rate limit), the error propagates to the calling code. The cassette is not written if any API call fails, ensuring cassettes always contain successful interactions. To record error responses intentionally, use `recordErrors: true` in options.

### `replay` Mode

In `replay` mode, no real API calls are made. Every outgoing LLM request is matched against the cassette file and the recorded response is returned. If no matching entry is found, an error is thrown.

**Behavior**:
1. Outgoing LLM request is intercepted.
2. Request is matched against cassette entries using the configured matching strategy.
3. If a match is found, the recorded response is returned (streamed if the original was streaming).
4. If no match is found, a `CassetteMismatchError` is thrown with details about the unmatched request and available entries.

**When to use**: CI environments, offline development, and any context where API calls must not be made. This is the strictest mode -- it guarantees zero API cost and fails fast if the cassette is stale.

**Error handling**: `CassetteMismatchError` includes the unmatched request summary and a list of available entries with match scores, helping the developer identify whether the cassette needs to be re-recorded or the test has a bug.

### `auto` Mode (Default)

In `auto` mode, `llm-vcr` replays from a cassette if one exists and records a new one if it does not. This is the default mode and provides the smoothest development workflow.

**Behavior**:
1. On test start, check if a cassette file exists for this name.
2. If the cassette file exists:
   a. Load it into memory.
   b. For each outgoing LLM request, attempt to match against the loaded entries.
   c. If a match is found, replay the recorded response.
   d. If no match is found, call the real API, record the response, and append it to the cassette.
   e. On test completion, write the updated cassette if new entries were added.
3. If no cassette file exists:
   a. Record all LLM calls to a new cassette.
   b. Write the cassette file on test completion.

**When to use**: Local development and iterative test writing. New tests automatically get recorded on first run. Existing tests replay instantly. Adding a new API call to an existing test records only the new call.

**Edge case**: If a test makes 3 API calls on the first run (creating a 3-entry cassette) and then a code change causes it to make only 2 calls, the third entry becomes unused. In `auto` mode, unused entries are preserved. To clean them, re-record the cassette or use the CLI's `clean` command.

### `passthrough` Mode

In `passthrough` mode, `llm-vcr` does not intercept any LLM calls. Requests go directly to the real API. No cassette file is read or written. This mode effectively disables `llm-vcr` for a specific test or globally.

**When to use**: Temporarily disabling recording/replay for debugging, running tests against a live API for manual verification, or disabling `llm-vcr` in specific test environments.

---

## 6. Interception Strategy

### HTTP-Level Interception

HTTP-level interception patches `globalThis.fetch` to intercept outgoing HTTP requests. This is the default interception strategy because it is provider-agnostic: any LLM provider that uses HTTP (which is all of them) is automatically captured.

**How it works**:

1. When a cassette is activated, `llm-vcr` stores a reference to the original `globalThis.fetch` and replaces it with a wrapper function.
2. The wrapper inspects each outgoing request URL against a set of known LLM provider URL patterns (e.g., `api.openai.com/v1/chat/completions`, `api.anthropic.com/v1/messages`, `generativelanguage.googleapis.com`).
3. If the URL matches a known LLM endpoint:
   a. In **record** mode: forward the request to the real `fetch`, capture the response (including streaming bodies), store the entry, and return the response to the caller.
   b. In **replay** mode: match the request against cassette entries, construct a synthetic `Response` object from the recorded data, and return it. For streaming responses, return a `Response` with a `ReadableStream` body that emits recorded chunks.
   c. In **auto** mode: attempt replay first, fall back to record.
4. If the URL does not match any LLM endpoint pattern, the request passes through to the original `fetch` unmodified.
5. When the cassette is deactivated, the original `globalThis.fetch` is restored.

**Provider URL patterns** (default, configurable):

| Provider | URL Pattern |
|----------|-------------|
| OpenAI | `api.openai.com/v1/*` |
| Azure OpenAI | `*.openai.azure.com/openai/deployments/*/chat/completions*` |
| Anthropic | `api.anthropic.com/v1/messages` |
| Google | `generativelanguage.googleapis.com/v1beta/models/*/generateContent*` |
| Google | `generativelanguage.googleapis.com/v1beta/models/*/streamGenerateContent*` |
| Custom | User-provided URL patterns |

**Streaming interception**: When the original response has `Content-Type: text/event-stream`, the wrapper reads the response body as a stream, buffers all SSE chunks with inter-chunk timestamps, and records them in the cassette entry. The response returned to the caller is the original (already consumed) stream reconstructed from the buffered chunks, preserving the streaming interface. On replay, a new `ReadableStream` emits chunks according to the recorded timing.

**Node.js `http`/`https` interception**: Some SDKs (notably older versions of the OpenAI SDK) use Node.js's `http.request` or `https.request` instead of `fetch`. `llm-vcr` optionally patches these as well via a `interceptHttp: true` configuration option. This uses the same URL-matching and recording logic, but wraps `http.ClientRequest` instead of `fetch`.

**Advantages**: Works with any LLM provider, any SDK, and any HTTP client library. No need to pass SDK clients to `llm-vcr`. Works with dynamically constructed HTTP requests, custom SDKs, and REST clients.

**Limitations**: Operates at the HTTP layer, so request/response parsing must understand the wire format of each provider. Cannot intercept calls made in child processes or worker threads (they have their own `globalThis`).

### SDK-Level Interception

SDK-level interception wraps specific methods on LLM provider SDK client objects. Instead of patching global HTTP, the developer passes their SDK client to `llm-vcr`, which returns a wrapped version that records and replays.

**How it works**:

```typescript
import OpenAI from 'openai';
import { createVCR } from 'llm-vcr';

const vcr = createVCR({ cassettesDir: '__cassettes__' });
const openai = new OpenAI();
const recorded = vcr.wrapClient(openai); // Returns a Proxy with recording

const response = await recorded.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }],
});
```

The `wrapClient` method returns a `Proxy` that intercepts calls to known SDK methods:

| SDK | Intercepted Methods |
|-----|-------------------|
| OpenAI | `chat.completions.create`, `completions.create`, `embeddings.create` |
| Anthropic | `messages.create`, `messages.stream` |

**Advantages**: Works at the typed SDK level -- request and response objects are already parsed, no HTTP wire format parsing needed. Cleaner cassette files because they contain SDK-level objects, not raw HTTP. Supports SDK-specific features like the Anthropic streaming helper.

**Limitations**: Requires the developer to pass their SDK client to `llm-vcr`. Does not intercept raw `fetch` calls or custom HTTP clients. New SDK methods require explicit wrapping support.

### Choosing a Strategy

| Use Case | Recommended Strategy |
|----------|---------------------|
| General-purpose recording | HTTP-level (default) |
| Testing with a specific SDK | SDK-level (cleaner cassettes) |
| Testing code that uses multiple SDKs | HTTP-level (captures all providers) |
| Testing code that uses raw fetch | HTTP-level (only option) |
| Testing streaming with Anthropic SDK helpers | SDK-level (preserves stream types) |

Both strategies can be active simultaneously. SDK-level interception takes priority: if a call is captured at the SDK level, the HTTP-level interceptor does not see it.

---

## 7. Request Matching

### Default Matching: Model + Messages

The default matching strategy compares the core semantic content of an LLM request while ignoring ephemeral metadata. Two requests "match" if they would produce the same logical LLM response (modulo non-determinism).

**Fields compared (must match)**:

| Field | Comparison |
|-------|------------|
| `model` | Exact string match |
| `messages` | Each message: `role` exact match, `content` normalized string match (trimmed whitespace, collapsed internal whitespace) |
| `temperature` | Exact number match (if present in both) |
| `top_p` | Exact number match (if present in both) |
| `max_tokens` / `max_completion_tokens` | Exact number match (if present in both) |
| `tools` / `functions` | Name and parameter schema match (ignoring description whitespace differences) |
| `response_format` | Exact match on `type` field; for `json_schema`, compare schema structure |
| `system` (Anthropic) | Normalized string match |

**Fields ignored (never affect matching)**:

| Field | Reason |
|-------|--------|
| Authorization header | Contains API key -- changes per environment |
| `x-request-id`, `x-stainless-*` headers | SDK-generated metadata |
| `User-Agent` header | SDK version changes across environments |
| `stream` parameter | Streaming vs. non-streaming may differ between record and replay |
| Timestamp fields | Change on every request |

### Normalized Matching

Normalized matching extends the default strategy with additional tolerance for formatting differences. It is useful when test inputs are constructed dynamically and may have minor whitespace or formatting variations.

- Whitespace: All runs of whitespace (spaces, tabs, newlines) are collapsed to a single space. Leading/trailing whitespace is trimmed.
- Message content: String content is normalized. Array content (multi-part messages with text and image_url blocks) has each text part normalized.
- Tool descriptions: Ignored entirely (descriptions are documentation, not functional).
- Parameter order: JSON object key order is ignored (objects are compared by sorted keys).

### Structural Matching

Structural matching compares the shape of the messages array without comparing exact content. Two requests match if they have the same number of messages, each message has the same role, and each message has the same content type (string, array, or tool call). The actual text content is not compared.

This is useful for tests where the prompt content varies (e.g., includes dynamic data) but the overall conversation structure (system message, few-shot examples, user query) remains constant.

### Custom Matcher

For specialized matching logic, callers provide a custom matcher function:

```typescript
withCassette('my-test', fn, {
  matcher: (request: RecordedRequest, entry: CassetteEntry) => {
    // Return a score between 0 and 1. 1 = perfect match. 0 = no match.
    // Return value above matchThreshold (default 0.8) counts as a match.
    if (request.model !== entry.request.model) return 0;
    if (request.messages.length !== entry.request.messages.length) return 0;
    // Compare only the last message (user query), ignore conversation history
    const lastReq = request.messages[request.messages.length - 1];
    const lastEntry = entry.request.messages[entry.request.messages.length - 1];
    return lastReq.content === lastEntry.content ? 1 : 0;
  },
});
```

### Hash-Based Matching for Fast Lookup

For cassettes with many entries, `llm-vcr` computes a content hash of each entry's request (SHA-256 of the canonicalized, sorted, scrubbed request JSON) and stores it in the cassette metadata. On replay, the incoming request is hashed and looked up in a hash map for O(1) matching. If no hash match is found, the full matching strategy is applied as a fallback (to handle normalized and structural matching that hashing cannot capture).

### Ordered vs. Unordered Matching

- **Ordered matching** (default): The first unmatched outgoing request is compared against the first unconsumed cassette entry. If it matches, the entry is consumed and the response is returned. If it does not match, matching fails. This mode is strict and catches changes in API call ordering.
- **Unordered matching** (`matchOrder: 'unordered'`): Each outgoing request is compared against all unconsumed cassette entries. The entry with the highest match score (above `matchThreshold`) is selected. This mode tolerates reordering of API calls and is useful when tests make concurrent LLM calls whose order is non-deterministic.

---

## 8. Cassette File Format

### Structure

A cassette file is a JSON document with the following top-level structure:

```json
{
  "version": 1,
  "name": "classifies user feedback",
  "recordedAt": "2026-03-18T14:30:00.000Z",
  "entries": [
    {
      "request": { ... },
      "response": { ... },
      "metadata": { ... }
    }
  ]
}
```

### Entry: Request

The `request` object captures the outgoing LLM API call:

```json
{
  "request": {
    "provider": "openai",
    "url": "https://api.openai.com/v1/chat/completions",
    "method": "POST",
    "headers": {
      "content-type": "application/json",
      "authorization": "[SCRUBBED]"
    },
    "body": {
      "model": "gpt-4o",
      "messages": [
        { "role": "system", "content": "You are a classifier." },
        { "role": "user", "content": "This product is amazing!" }
      ],
      "temperature": 0,
      "max_tokens": 100,
      "tools": [
        {
          "type": "function",
          "function": {
            "name": "classify",
            "parameters": {
              "type": "object",
              "properties": {
                "sentiment": { "type": "string", "enum": ["positive", "negative", "neutral"] }
              },
              "required": ["sentiment"]
            }
          }
        }
      ]
    }
  }
}
```

**Provider detection**: The `provider` field is auto-detected from the URL. `openai` for OpenAI and Azure OpenAI, `anthropic` for Anthropic, `google` for Google, `unknown` for unrecognized endpoints. Provider detection is used for response parsing and streaming format handling.

### Entry: Response

The `response` object captures the LLM API response. For non-streaming responses:

```json
{
  "response": {
    "status": 200,
    "headers": {
      "content-type": "application/json",
      "x-ratelimit-remaining-tokens": "29500"
    },
    "body": {
      "id": "chatcmpl-abc123",
      "object": "chat.completion",
      "model": "gpt-4o-2024-08-06",
      "choices": [
        {
          "index": 0,
          "message": {
            "role": "assistant",
            "content": null,
            "tool_calls": [
              {
                "id": "call_xyz",
                "type": "function",
                "function": {
                  "name": "classify",
                  "arguments": "{\"sentiment\": \"positive\"}"
                }
              }
            ]
          },
          "finish_reason": "tool_calls"
        }
      ],
      "usage": {
        "prompt_tokens": 85,
        "completion_tokens": 12,
        "total_tokens": 97
      }
    }
  }
}
```

### Entry: Streaming Response

For streaming responses, the `response` object contains the full chunk sequence:

```json
{
  "response": {
    "status": 200,
    "headers": {
      "content-type": "text/event-stream"
    },
    "streaming": true,
    "chunks": [
      {
        "data": "{\"id\":\"chatcmpl-abc\",\"object\":\"chat.completion.chunk\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"\"},\"finish_reason\":null}]}",
        "timestamp": 0
      },
      {
        "data": "{\"id\":\"chatcmpl-abc\",\"object\":\"chat.completion.chunk\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Hello\"},\"finish_reason\":null}]}",
        "timestamp": 45
      },
      {
        "data": "{\"id\":\"chatcmpl-abc\",\"object\":\"chat.completion.chunk\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\" there\"},\"finish_reason\":null}]}",
        "timestamp": 82
      },
      {
        "data": "{\"id\":\"chatcmpl-abc\",\"object\":\"chat.completion.chunk\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}",
        "timestamp": 120
      },
      {
        "data": "[DONE]",
        "timestamp": 121
      }
    ],
    "assembled": {
      "content": "Hello there",
      "finish_reason": "stop",
      "usage": {
        "prompt_tokens": 10,
        "completion_tokens": 2,
        "total_tokens": 12
      }
    }
  }
}
```

The `chunks` array preserves the exact SSE data payloads as received from the API. The `timestamp` field on each chunk is the millisecond offset from the first chunk, preserving inter-chunk timing for realistic replay. The `assembled` field is a convenience summary of the full response, assembled from all chunks, for human readability and for tools that consume cassettes (e.g., `llm-cost-per-test` reading token usage).

### Entry: Metadata

```json
{
  "metadata": {
    "recordedAt": "2026-03-18T14:30:00.000Z",
    "durationMs": 1234,
    "requestHash": "sha256:a1b2c3d4...",
    "costEstimate": {
      "inputTokens": 85,
      "outputTokens": 12,
      "estimatedCostUsd": 0.00123
    }
  }
}
```

- `recordedAt`: ISO 8601 timestamp of when this entry was recorded.
- `durationMs`: Wall-clock time from request sent to response fully received (including all stream chunks).
- `requestHash`: SHA-256 hash of the canonicalized request, used for fast hash-based matching.
- `costEstimate`: Token counts and estimated cost in USD, computed from the response's `usage` field and model pricing (best-effort, not guaranteed accurate).

### Cassette File Naming

Cassette files are named based on the cassette name passed to `withCassette`. The name is sanitized for filesystem use: spaces are replaced with hyphens, special characters are removed, and the result is lowercased. The file extension is `.cassette.json`.

```
withCassette('classifies user feedback', fn)
→ __cassettes__/classifies-user-feedback.cassette.json

withCassette('OpenAI / streaming / tool calls', fn)
→ __cassettes__/openai-streaming-tool-calls.cassette.json
```

### Format Versioning

The `version` field in the cassette file enables forward-compatible format evolution. Version 1 is the initial format. If the format changes in a backward-incompatible way, the version number increments. `llm-vcr` reads cassettes of any supported version and writes in the latest version. A version mismatch warning is emitted (not an error) when reading an older version.

---

## 9. Streaming Support

### Recording Streams

When an LLM API returns a streaming response (SSE), `llm-vcr` must record the full stream while still delivering it to the calling code in real-time. The recording strategy uses a `TransformStream` tee:

1. The interceptor makes the real API call and receives a `Response` with a `ReadableStream` body.
2. The stream is teed (`body.tee()`), producing two identical streams.
3. One stream is returned to the calling code (so the application receives chunks in real-time as normal).
4. The other stream is consumed by `llm-vcr`'s recorder, which buffers each chunk with a `timestamp` (milliseconds since the first chunk) and an `eventType` (always `"data"` for SSE).
5. When the stream completes (the `[DONE]` sentinel is received, or the stream closes), the recorder assembles the full response from the chunks and stores the entry with both the `chunks` array and the `assembled` summary.

**Edge cases**:
- **Stream error mid-way**: If the stream errors (network drop, server error), the recorder stores the chunks received so far and marks the entry with `"streamError": true` and the error message. On replay, the same error is emitted at the same point in the stream.
- **Empty stream**: If the response has a streaming content type but no chunks are received, the entry is stored with an empty `chunks` array.
- **Very long streams**: Some LLM responses (especially with large `max_tokens`) produce hundreds of chunks. All chunks are stored. The cassette file may be large, but JSON compression (if `gzip: true` is configured) mitigates this.

### Replaying Streams

When replaying a streaming entry, `llm-vcr` constructs a synthetic `Response` with a `ReadableStream` body that emits the recorded chunks. Replay speed is configurable:

- **`instant`** (default for tests): All chunks are emitted immediately with no delay. The stream completes as fast as the consumer can read it. This is the fastest replay mode and is appropriate for unit tests that do not depend on timing.
- **`realtime`**: Chunks are emitted with the original inter-chunk delays from the `timestamp` field. If chunk 1 was at 0ms and chunk 2 was at 45ms, the replay waits 45ms between them. This mode is useful for testing streaming UI behavior with realistic timing.
- **`scaled`**: Chunks are emitted with delays scaled by a configurable factor. `replaySpeed: 10` means 10x faster than real-time: a 45ms gap becomes 4.5ms. This provides a middle ground between instant and real-time.

```typescript
withCassette('streaming-test', fn, {
  replaySpeed: 'instant',    // No delays (default)
  // replaySpeed: 'realtime', // Original timing
  // replaySpeed: 10,         // 10x faster than real-time
});
```

### Streaming Format Handling by Provider

Each LLM provider uses a different SSE format. `llm-vcr` understands these formats for response assembly and provides accurate `assembled` summaries:

**OpenAI**:
- SSE events have `data:` prefix.
- Each chunk is a JSON object with `choices[].delta` containing incremental content.
- Stream ends with `data: [DONE]`.
- Usage information may be in the final chunk (if `stream_options.include_usage` is set) or absent.

**Anthropic**:
- SSE events have typed event names: `message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`.
- Content is delivered in `content_block_delta` events with `delta.text` or `delta.partial_json`.
- Usage information is split: input tokens in `message_start`, output tokens in `message_delta`.

**Google (Gemini)**:
- Streaming uses `generateContent` with `alt=sse` query parameter.
- Each chunk is a complete `GenerateContentResponse` JSON object (not a delta).
- No explicit end-of-stream sentinel.

`llm-vcr` stores the raw SSE data as received (preserving provider-specific format) and uses provider detection to assemble the `assembled` summary correctly.

---

## 10. Provider Support

### OpenAI

**Supported endpoints**:
- `POST /v1/chat/completions` -- chat completions (streaming and non-streaming)
- `POST /v1/completions` -- legacy completions
- `POST /v1/embeddings` -- text embeddings

**Supported features**:
- Streaming via SSE (including `stream_options.include_usage`)
- Tool calls / function calls
- Structured outputs (`response_format: { type: 'json_schema', ... }`)
- Vision (image_url content parts)
- Multi-turn conversations
- System messages

**Azure OpenAI**: Supported via URL pattern matching. Azure endpoints use `*.openai.azure.com/openai/deployments/*/chat/completions` and include `api-version` as a query parameter. The API key is in the `api-key` header (instead of `Authorization: Bearer`).

### Anthropic

**Supported endpoints**:
- `POST /v1/messages` -- messages API (streaming and non-streaming)

**Supported features**:
- Streaming via SSE (Anthropic's event-typed format)
- Tool use (tool_choice, tool results)
- System prompt (top-level `system` field)
- Multi-turn conversations
- Vision (base64 image content blocks)
- Extended thinking (when enabled by the API)

**Anthropic SDK streaming helpers**: When using SDK-level interception, `llm-vcr` wraps the Anthropic SDK's `.stream()` method and its helper methods (`.on('text')`, `.finalMessage()`, etc.) so they work correctly with replayed data.

### Google (Gemini)

**Supported endpoints**:
- `POST /v1beta/models/*/generateContent` -- non-streaming content generation
- `POST /v1beta/models/*/streamGenerateContent` -- streaming content generation

**Supported features**:
- Streaming via SSE
- Tool calls (function declarations and function responses)
- System instructions
- Multi-turn conversations

### Generic / Custom Providers

Any LLM provider that uses HTTP POST with JSON request/response is supported via HTTP-level interception. Custom provider URL patterns are added via configuration:

```typescript
const vcr = createVCR({
  providerPatterns: [
    { name: 'my-llm', pattern: /^https:\/\/api\.my-llm\.com\/v1\/chat/ },
  ],
});
```

For custom providers, `llm-vcr` records the raw HTTP request/response without provider-specific parsing. Streaming is supported if the response uses standard SSE (`Content-Type: text/event-stream`), but the `assembled` summary may be incomplete without a provider-specific parser.

---

## 11. API Surface

### Installation

```bash
npm install --save-dev llm-vcr
```

### Core Functions

```typescript
import {
  withCassette,
  useCassette,
  createVCR,
  record,
  replay,
} from 'llm-vcr';
```

### `withCassette(name, fn, options?)`

Wraps an async function with cassette recording/replay. The primary API for most use cases.

```typescript
async function withCassette<T>(
  name: string,
  fn: () => Promise<T>,
  options?: CassetteOptions,
): Promise<T>;
```

**Parameters**:
- `name`: Cassette name. Used to derive the cassette file path.
- `fn`: The async function to execute with interception active. All LLM calls made within this function are intercepted.
- `options`: Override default options for this cassette.

**Returns**: The return value of `fn`.

**Example**:

```typescript
import { withCassette } from 'llm-vcr';
import OpenAI from 'openai';

const openai = new OpenAI();

const result = await withCassette('greeting-test', async () => {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Say hello' }],
  });
  return response.choices[0].message.content;
});

console.log(result); // "Hello! How can I help you today?"
// First run: real API call, recorded to __cassettes__/greeting-test.cassette.json
// Subsequent runs: replayed from cassette, no API call
```

### `useCassette(name, options?)`

Returns an object with `start()` and `stop()` methods for manual cassette lifecycle management. Useful in `beforeEach`/`afterEach` hooks.

```typescript
function useCassette(name: string, options?: CassetteOptions): {
  start(): Promise<void>;
  stop(): Promise<void>;
};
```

**Example**:

```typescript
import { useCassette } from 'llm-vcr';

describe('my LLM feature', () => {
  let cassette: ReturnType<typeof useCassette>;

  beforeEach(async () => {
    cassette = useCassette('my-feature');
    await cassette.start();
  });

  afterEach(async () => {
    await cassette.stop();
  });

  it('generates a response', async () => {
    const response = await openai.chat.completions.create({ ... });
    expect(response.choices[0].message.content).toBeDefined();
  });
});
```

### `createVCR(config)`

Creates a configured `LLMVcr` instance with project-wide defaults.

```typescript
function createVCR(config: VCRConfig): LLMVcr;
```

**Returns**: An `LLMVcr` instance with methods for cassette management.

```typescript
const vcr = createVCR({
  cassettesDir: '__cassettes__',
  mode: 'auto',
  scrub: { patterns: [/x-custom-secret/i] },
  matching: { strategy: 'default', order: 'ordered' },
  streaming: { replaySpeed: 'instant' },
});

// Use the configured instance
await vcr.withCassette('test-name', async () => { ... });

// Or wrap an SDK client
const recorded = vcr.wrapClient(openai);
```

### `record(client, cassettePath)`

Convenience function for SDK-level recording. Wraps an SDK client and records all calls to a cassette file.

```typescript
function record<T extends object>(client: T, cassettePath: string): T;
```

**Example**:

```typescript
import { record } from 'llm-vcr';
import OpenAI from 'openai';

const openai = record(new OpenAI(), '__cassettes__/my-test.cassette.json');
// All calls to openai.chat.completions.create() are now recorded
```

### `replay(cassettePath)`

Convenience function that activates replay mode for a specific cassette file. All matching LLM HTTP calls will be answered from the cassette.

```typescript
function replay(cassettePath: string): {
  start(): Promise<void>;
  stop(): Promise<void>;
};
```

### `LLMVcr` Class

```typescript
class LLMVcr {
  constructor(config: VCRConfig);

  /** Wrap an async function with cassette recording/replay. */
  withCassette<T>(name: string, fn: () => Promise<T>, options?: CassetteOptions): Promise<T>;

  /** Get a cassette controller for manual lifecycle management. */
  useCassette(name: string, options?: CassetteOptions): CassetteController;

  /** Wrap an SDK client for SDK-level interception. */
  wrapClient<T extends object>(client: T): T;

  /** List all cassette files in the cassettes directory. */
  listCassettes(): Promise<CassetteSummary[]>;

  /** Load and parse a cassette file. */
  loadCassette(name: string): Promise<Cassette>;

  /** Delete a cassette file. */
  deleteCassette(name: string): Promise<void>;

  /** Re-record a specific cassette by running the original fn in record mode. */
  rerecordCassette(name: string, fn: () => Promise<void>): Promise<void>;

  /** Find cassettes that are not referenced by any test file. */
  findStaleCassettes(testGlob: string): Promise<string[]>;
}
```

### Type Definitions

```typescript
// ── Configuration ────────────────────────────────────────────────────

interface VCRConfig {
  /** Directory to store cassette files.
   *  Default: '__cassettes__' relative to the test file. */
  cassettesDir?: string;

  /** Global recording mode.
   *  Default: 'auto'.
   *  Override with LLM_VCR_MODE env var. */
  mode?: VCRMode;

  /** Sensitive data scrubbing configuration. */
  scrub?: ScrubConfig;

  /** Request matching configuration. */
  matching?: MatchingConfig;

  /** Streaming replay configuration. */
  streaming?: StreamingConfig;

  /** Custom provider URL patterns to intercept. */
  providerPatterns?: ProviderPattern[];

  /** Whether to also intercept Node.js http/https.request.
   *  Default: false (only fetch is intercepted). */
  interceptHttp?: boolean;

  /** Whether to record API error responses (4xx, 5xx) in cassettes.
   *  Default: false (errors propagate, cassette is not written). */
  recordErrors?: boolean;

  /** Whether to compress cassette files with gzip.
   *  Default: false (plain JSON for human readability). */
  gzip?: boolean;
}

type VCRMode = 'record' | 'replay' | 'auto' | 'passthrough';

interface ScrubConfig {
  /** Additional header name patterns to scrub (beyond default API key patterns).
   *  Default scrubbed headers: authorization, api-key, x-api-key. */
  patterns?: RegExp[];

  /** Additional body field name patterns to scrub. */
  bodyPatterns?: RegExp[];

  /** Replace scrubbed values with this string. Default: '[SCRUBBED]'. */
  replacement?: string;

  /** Replace scrubbed values with environment variable references.
   *  e.g., { 'sk-proj-abc123': '${OPENAI_API_KEY}' } */
  envVarMap?: Record<string, string>;
}

interface MatchingConfig {
  /** Matching strategy. Default: 'default'. */
  strategy?: 'default' | 'normalized' | 'structural' | 'custom';

  /** Custom matcher function (required if strategy is 'custom'). */
  matcher?: MatcherFn;

  /** Minimum score for a match to be accepted. Default: 0.8. */
  matchThreshold?: number;

  /** Match order. Default: 'ordered'. */
  order?: 'ordered' | 'unordered';
}

type MatcherFn = (request: RecordedRequest, entry: CassetteEntry) => number;

interface StreamingConfig {
  /** Replay speed for streaming responses.
   *  'instant': no delays (default).
   *  'realtime': original timing.
   *  number: speed multiplier (e.g., 10 = 10x faster). */
  replaySpeed?: 'instant' | 'realtime' | number;
}

interface ProviderPattern {
  /** Human-readable provider name. */
  name: string;

  /** URL pattern to match. */
  pattern: RegExp;

  /** Optional custom streaming parser for this provider. */
  streamParser?: StreamParser;
}

// ── Cassette Types ───────────────────────────────────────────────────

interface Cassette {
  /** Format version. */
  version: number;

  /** Cassette name. */
  name: string;

  /** ISO 8601 timestamp of when the cassette was recorded. */
  recordedAt: string;

  /** Recorded interactions. */
  entries: CassetteEntry[];
}

interface CassetteEntry {
  /** Recorded request. */
  request: RecordedRequest;

  /** Recorded response. */
  response: RecordedResponse;

  /** Recording metadata. */
  metadata: EntryMetadata;
}

interface RecordedRequest {
  /** Auto-detected provider name. */
  provider: string;

  /** Request URL. */
  url: string;

  /** HTTP method. */
  method: string;

  /** Request headers (sensitive values scrubbed). */
  headers: Record<string, string>;

  /** Parsed request body. */
  body: Record<string, unknown>;
}

interface RecordedResponse {
  /** HTTP status code. */
  status: number;

  /** Response headers. */
  headers: Record<string, string>;

  /** Parsed response body (for non-streaming responses). */
  body?: Record<string, unknown>;

  /** Whether this was a streaming response. */
  streaming?: boolean;

  /** Recorded SSE chunks (for streaming responses). */
  chunks?: StreamChunk[];

  /** Assembled full response (for streaming responses). */
  assembled?: AssembledResponse;

  /** Whether the stream errored. */
  streamError?: boolean;

  /** Stream error message. */
  streamErrorMessage?: string;
}

interface StreamChunk {
  /** Raw SSE data payload. */
  data: string;

  /** SSE event type (if not the default 'message'). */
  event?: string;

  /** Millisecond offset from first chunk. */
  timestamp: number;
}

interface AssembledResponse {
  /** Full assembled content text. */
  content?: string;

  /** Finish reason. */
  finish_reason?: string;

  /** Token usage. */
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };

  /** Tool calls (if any). */
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
}

interface EntryMetadata {
  /** ISO 8601 timestamp of recording. */
  recordedAt: string;

  /** Wall-clock duration in milliseconds. */
  durationMs: number;

  /** SHA-256 hash of canonicalized request for fast matching. */
  requestHash: string;

  /** Estimated cost. */
  costEstimate?: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };
}

interface CassetteSummary {
  /** Cassette name. */
  name: string;

  /** File path. */
  filePath: string;

  /** Number of entries. */
  entryCount: number;

  /** Total recorded duration across all entries. */
  totalDurationMs: number;

  /** Total tokens across all entries. */
  totalTokens: number;

  /** When the cassette was recorded. */
  recordedAt: string;
}

// ── Errors ───────────────────────────────────────────────────────────

class CassetteMismatchError extends Error {
  /** The unmatched request. */
  request: RecordedRequest;

  /** Available cassette entries with their match scores. */
  availableEntries: Array<{ entry: CassetteEntry; score: number }>;
}

class CassetteNotFoundError extends Error {
  /** The cassette name that was not found. */
  cassetteName: string;

  /** The file path that was checked. */
  filePath: string;
}

// ── Cassette Controller ──────────────────────────────────────────────

interface CassetteController {
  /** Activate the cassette (start interception). */
  start(): Promise<void>;

  /** Deactivate the cassette (stop interception, write file if recording). */
  stop(): Promise<void>;

  /** Get the current cassette state. */
  readonly state: 'idle' | 'active' | 'stopped';

  /** Get entries recorded or replayed so far. */
  readonly entries: ReadonlyArray<CassetteEntry>;
}

// ── Stream Parser ────────────────────────────────────────────────────

interface StreamParser {
  /** Parse an SSE data payload into a provider-specific chunk object. */
  parseChunk(data: string): unknown;

  /** Detect if this is the end-of-stream sentinel. */
  isEndOfStream(data: string): boolean;

  /** Assemble a full response from an array of parsed chunks. */
  assemble(chunks: unknown[]): AssembledResponse;
}
```

---

## 12. Test Framework Integration

### Vitest

```typescript
// vitest.setup.ts
import { setupVCR } from 'llm-vcr/vitest';

setupVCR({
  cassettesDir: '__cassettes__',
  mode: process.env.CI ? 'replay' : 'auto',
});
```

`setupVCR` for Vitest installs `beforeEach` and `afterEach` hooks at the global level. When a test calls `useCassette()` or `withCassette()`, the hooks manage cassette lifecycle automatically. The cassette name defaults to the test name if not specified.

```typescript
// my-feature.test.ts
import { describe, it, expect } from 'vitest';
import { withCassette } from 'llm-vcr';
import OpenAI from 'openai';

const openai = new OpenAI();

describe('my feature', () => {
  it('generates a summary', async () => {
    const result = await withCassette('generates-a-summary', async () => {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Summarize: TypeScript is great.' }],
      });
      return response.choices[0].message.content;
    });

    expect(result).toContain('TypeScript');
  });
});
```

**Automatic cassette naming**: When `setupVCR` is configured, tests can omit the cassette name. The name is derived from the test's full path: `describe name > it name`, sanitized for filesystem use.

```typescript
it('classifies feedback', async () => {
  // Cassette name auto-derived: "my-feature-classifies-feedback"
  await withCassette(async () => {
    // ...
  });
});
```

**Update cassettes**: Run `vitest run --update-cassettes` or set `LLM_VCR_MODE=record` to re-record all cassettes.

### Jest

```typescript
// jest.setup.ts
import { setupVCR } from 'llm-vcr/jest';

setupVCR({
  cassettesDir: '__cassettes__',
  mode: process.env.CI ? 'replay' : 'auto',
});
```

The Jest integration works identically to Vitest. It uses `beforeEach`/`afterEach` globals and derives cassette names from `expect.getState().currentTestName`.

### Mocha

```typescript
// mocha-hooks.ts
import { setupVCR } from 'llm-vcr/mocha';

export const mochaHooks = setupVCR({
  cassettesDir: '__cassettes__',
  mode: 'auto',
});
```

The Mocha integration exports root-level hooks (`beforeEach`, `afterEach`) via Mocha's root hook plugin pattern. Cassette names are derived from `this.currentTest.fullTitle()`.

### Manual Integration

For test frameworks not explicitly supported, or for non-test contexts:

```typescript
import { useCassette } from 'llm-vcr';

const cassette = useCassette('my-recording');
await cassette.start();

// ... make LLM calls ...

await cassette.stop();
// Cassette file written to __cassettes__/my-recording.cassette.json
```

---

## 13. Sensitive Data

### Default Scrubbing

By default, `llm-vcr` scrubs the following from cassette files at write time:

| Data | Location | Replacement |
|------|----------|-------------|
| API key | `Authorization` header | `[SCRUBBED]` |
| API key | `api-key` header | `[SCRUBBED]` |
| API key | `x-api-key` header | `[SCRUBBED]` |
| Organization ID | `openai-organization` header | `[SCRUBBED]` |
| Project ID | `openai-project` header | `[SCRUBBED]` |
| Anthropic API key | `x-api-key` header | `[SCRUBBED]` |

Scrubbing is applied to the cassette file only. In-memory request/response objects during recording retain their real values (needed for the actual API call to succeed).

### Custom Scrub Patterns

Additional patterns can be configured:

```typescript
const vcr = createVCR({
  scrub: {
    patterns: [
      /x-custom-auth/i,
      /x-internal-token/i,
    ],
    bodyPatterns: [
      /password/i,
      /secret/i,
    ],
    replacement: '[REDACTED]',
  },
});
```

`patterns` matches against header names. `bodyPatterns` matches against request body field names (recursively). When a body field name matches, its value is replaced with the `replacement` string.

### Environment Variable Placeholders

For teams that want cassette files to explicitly document which environment variable held the scrubbed value:

```typescript
const vcr = createVCR({
  scrub: {
    envVarMap: {
      [process.env.OPENAI_API_KEY!]: '${OPENAI_API_KEY}',
      [process.env.ANTHROPIC_API_KEY!]: '${ANTHROPIC_API_KEY}',
    },
  },
});
```

Any occurrence of the actual API key value anywhere in the cassette (headers, body, response) is replaced with the environment variable reference. This makes cassettes self-documenting about where secrets came from.

### What Is NOT Scrubbed

User-provided prompt content, LLM response content, tool call arguments, and function call results are not scrubbed. If prompts contain sensitive data (PII, proprietary content), developers must either:
1. Use synthetic test data in prompts.
2. Add custom scrub patterns that target specific body fields.
3. Use the `transformEntry` hook to modify entries before they are written.

```typescript
const vcr = createVCR({
  transformEntry: (entry) => {
    // Replace all user messages with anonymized versions
    entry.request.body.messages = entry.request.body.messages.map((msg: any) => {
      if (msg.role === 'user') {
        return { ...msg, content: '[USER_INPUT]' };
      }
      return msg;
    });
    return entry;
  },
});
```

---

## 14. Configuration

### Configuration Resolution Order

Configuration is resolved in the following order (later overrides earlier):

1. **Defaults**: Built-in defaults for all options.
2. **`createVCR` config**: Project-wide configuration passed to the factory.
3. **Environment variables**: Override mode and directory via env vars.
4. **Per-cassette options**: Options passed to `withCassette` or `useCassette`.

### Environment Variables

| Variable | Purpose | Values |
|----------|---------|--------|
| `LLM_VCR_MODE` | Override recording mode globally | `record`, `replay`, `auto`, `passthrough` |
| `LLM_VCR_DIR` | Override cassettes directory | Absolute or relative path |
| `LLM_VCR_UPDATE` | Alias for `LLM_VCR_MODE=record` | `1`, `true`, `yes` |

### All Options with Defaults

```typescript
const defaults: VCRConfig = {
  cassettesDir: '__cassettes__',   // Relative to test file or cwd
  mode: 'auto',                    // 'auto' | 'record' | 'replay' | 'passthrough'
  scrub: {
    patterns: [],                  // Additional header patterns (defaults always applied)
    bodyPatterns: [],              // Body field patterns
    replacement: '[SCRUBBED]',     // Replacement string
    envVarMap: {},                 // Value-to-variable mapping
  },
  matching: {
    strategy: 'default',           // 'default' | 'normalized' | 'structural' | 'custom'
    matcher: undefined,            // Custom matcher function
    matchThreshold: 0.8,           // Minimum match score
    order: 'ordered',              // 'ordered' | 'unordered'
  },
  streaming: {
    replaySpeed: 'instant',        // 'instant' | 'realtime' | number
  },
  providerPatterns: [],            // Additional provider URL patterns
  interceptHttp: false,            // Intercept http/https.request
  recordErrors: false,             // Record 4xx/5xx responses
  gzip: false,                     // Compress cassette files
};
```

### Per-Cassette Options

```typescript
interface CassetteOptions {
  /** Override mode for this cassette. */
  mode?: VCRMode;

  /** Override matching config for this cassette. */
  matching?: Partial<MatchingConfig>;

  /** Override streaming config for this cassette. */
  streaming?: Partial<StreamingConfig>;

  /** Custom entry transform for this cassette. */
  transformEntry?: (entry: CassetteEntry) => CassetteEntry | null;

  /** Whether to record error responses for this cassette. */
  recordErrors?: boolean;
}
```

---

## 15. CLI

### Installation

The CLI is included in the `llm-vcr` package and available as `llm-vcr` when installed globally or via `npx`.

```bash
npx llm-vcr <command> [options]
```

### Commands

#### `llm-vcr list`

List all cassette files in the cassettes directory.

```bash
npx llm-vcr list [--dir <path>] [--json]
```

**Output** (human-readable):

```
Cassettes in __cassettes__/ (5 files)

  classifies-user-feedback.cassette.json
    Entries: 2 | Tokens: 234 | Duration: 1.2s | Recorded: 2026-03-15

  generates-summary.cassette.json
    Entries: 1 | Tokens: 156 | Duration: 0.8s | Recorded: 2026-03-16

  streaming-chat.cassette.json
    Entries: 1 (streaming) | Tokens: 89 | Duration: 2.1s | Recorded: 2026-03-17

  tool-call-weather.cassette.json
    Entries: 3 | Tokens: 445 | Duration: 3.4s | Recorded: 2026-03-18

  multi-turn-conversation.cassette.json
    Entries: 4 | Tokens: 1023 | Duration: 5.6s | Recorded: 2026-03-18

Total: 5 cassettes, 11 entries, 1947 tokens
```

**Output** (`--json`): Array of `CassetteSummary` objects.

#### `llm-vcr inspect <name>`

Display the contents of a cassette file in a human-readable format.

```bash
npx llm-vcr inspect classifies-user-feedback [--dir <path>] [--entry <index>] [--json]
```

**Output**:

```
Cassette: classifies-user-feedback
File: __cassettes__/classifies-user-feedback.cassette.json
Recorded: 2026-03-15T10:30:00.000Z
Entries: 2

── Entry 1 ──────────────────────────────────────────────────
  Provider: openai
  Model: gpt-4o
  Messages:
    [system] You are a classifier.
    [user] This product is amazing!
  Temperature: 0
  Response: tool_call classify({"sentiment": "positive"})
  Tokens: 85 in / 12 out (97 total)
  Duration: 1.2s
  Est. Cost: $0.0012

── Entry 2 ──────────────────────────────────────────────────
  Provider: openai
  Model: gpt-4o
  Messages:
    [system] You are a classifier.
    [user] The delivery was late and the box was damaged.
  Temperature: 0
  Response: tool_call classify({"sentiment": "negative"})
  Tokens: 92 in / 12 out (104 total)
  Duration: 0.9s
  Est. Cost: $0.0010
```

#### `llm-vcr clean`

Remove stale cassettes (cassettes not referenced by any test file).

```bash
npx llm-vcr clean [--dir <path>] [--test-glob <pattern>] [--dry-run]
```

The command scans test files matching `--test-glob` (default: `**/*.test.{ts,js,tsx,jsx}`) for cassette name references, compares against cassette files on disk, and deletes (or reports, with `--dry-run`) unreferenced cassettes.

#### `llm-vcr rerecord <name>`

Re-record a specific cassette by running it in `record` mode. This requires the test to be runnable (API keys available, network access).

```bash
npx llm-vcr rerecord classifies-user-feedback [--dir <path>]
```

This command sets `LLM_VCR_MODE=record` and runs the test associated with the cassette. The association is discovered by searching test files for the cassette name.

#### `llm-vcr validate`

Validate cassette file integrity: check JSON syntax, verify version compatibility, and confirm all required fields are present.

```bash
npx llm-vcr validate [--dir <path>]
```

**Exit codes**:
- `0`: All cassettes valid.
- `1`: One or more cassettes invalid (details printed to stderr).

---

## 16. Integration with the npm-master Ecosystem

### prompt-snap

`prompt-snap` provides snapshot testing for LLM outputs with fuzzy matching. `llm-vcr` and `prompt-snap` are complementary:

- **`llm-vcr`**: Records and replays the LLM API call, providing deterministic output.
- **`prompt-snap`**: Compares the output against a stored snapshot with configurable matching strategies.

Combined workflow:

```typescript
import { withCassette } from 'llm-vcr';
import { setupPromptSnap } from 'prompt-snap';

setupPromptSnap({ strategy: 'semantic', threshold: 0.85, embedFn: myEmbedder });

it('generates a product description', async () => {
  const output = await withCassette('product-description', async () => {
    const response = await openai.chat.completions.create({ ... });
    return response.choices[0].message.content;
  });

  // On first run: llm-vcr records the API call, prompt-snap creates the snapshot.
  // On subsequent runs: llm-vcr replays (deterministic output), prompt-snap compares.
  // When re-recording (new model/prompt): llm-vcr records new output,
  //   prompt-snap checks if it's semantically similar to the old snapshot.
  await expect(output).toMatchPromptSnapshot();
});
```

This layered approach separates concerns: `llm-vcr` handles API call determinism and cost elimination, `prompt-snap` handles output quality regression detection.

### llm-cost-per-test

`llm-cost-per-test` tracks the cost of LLM API calls per test case. It can read token usage data from `llm-vcr` cassette files to report cost even when running in replay mode (no real API calls):

```typescript
import { createCostTracker } from 'llm-cost-per-test';
import { createVCR } from 'llm-vcr';

const vcr = createVCR({ cassettesDir: '__cassettes__' });
const costTracker = createCostTracker({ vcr }); // Reads token data from cassettes
```

When a test replays from a cassette, `llm-cost-per-test` reads the `costEstimate` metadata from the cassette entries rather than instrumenting live API calls. This provides cost reporting even in replay-only CI environments.

### llm-regression

`llm-regression` detects regression in LLM behavior across model versions, prompt changes, or provider migrations. `llm-vcr` cassettes serve as the baseline:

1. Record cassettes with the current model/prompt (baseline).
2. Switch to a new model/prompt.
3. Run in `record` mode to record new cassettes.
4. `llm-regression` compares old and new cassette files to identify behavioral differences.

### mcp-server-mock

`mcp-server-mock` provides mock MCP servers for testing MCP clients. If an application uses both MCP tools and direct LLM API calls, `mcp-server-mock` handles the MCP layer while `llm-vcr` handles the LLM API layer. They operate independently at different protocol levels.

---

## 17. Testing Strategy

### Unit Tests

**Interception tests**:
- Fetch interception: verify that `globalThis.fetch` is patched when a cassette is active and restored when deactivated.
- URL matching: verify that requests to LLM provider URLs are intercepted and non-LLM URLs pass through.
- Multiple cassettes: verify that activating a second cassette while one is active throws an error.
- Nested `withCassette` calls: verify correct behavior (error or scope isolation).

**Request matching tests**:
- Default matching: identical requests match. Requests differing only in API key match. Requests with different models do not match. Requests with different messages do not match.
- Normalized matching: requests with different whitespace match. Requests with different parameter order match.
- Structural matching: requests with same message count and roles match regardless of content.
- Custom matching: custom matcher function is called with correct arguments. Score above threshold passes. Score below threshold fails.
- Hash-based matching: hash lookup finds exact matches. Hash miss falls through to full matching.
- Ordered matching: entries are consumed in order. Out-of-order requests fail.
- Unordered matching: best-match entry is selected regardless of order.

**Scrubbing tests**:
- Default scrubbing: Authorization header is replaced with `[SCRUBBED]`.
- Custom patterns: additional header and body patterns are scrubbed.
- Env var placeholders: actual values are replaced with `${VAR_NAME}`.
- Nested body fields: recursive scrubbing applies.
- Response headers: sensitive response headers are scrubbed.
- Scrubbing does not modify in-memory objects: only the serialized file is affected.

**Cassette file tests**:
- Write: cassette is serialized to well-formed JSON with correct structure.
- Read: valid cassette file is parsed correctly.
- Version: old version cassettes are read with a warning. Invalid version throws.
- Corrupt file: invalid JSON throws `CassetteCorruptError`.
- Missing file in replay mode: throws `CassetteNotFoundError`.
- Missing file in auto mode: new cassette is created.
- File naming: special characters are sanitized. Spaces become hyphens.

**Streaming tests**:
- Record: SSE stream is fully captured with chunk data and timestamps.
- Replay instant: all chunks emitted with no delay.
- Replay realtime: chunks emitted with original timing (within tolerance).
- Replay scaled: chunks emitted at configured speed multiplier.
- Stream error: error is recorded and replayed at the correct position.
- Empty stream: empty chunks array recorded and replayed.
- Assembled response: content, usage, and tool calls are correctly assembled from chunks.

**Provider tests**:
- OpenAI: non-streaming and streaming responses parsed and assembled correctly.
- Anthropic: event-typed SSE format parsed and assembled correctly.
- Google: chunked response format parsed and assembled correctly.
- Unknown provider: raw HTTP recorded without provider-specific parsing.

### Integration Tests

- **Full lifecycle (auto mode)**: Create a test with `withCassette`. First run records (using a mock HTTP server that simulates an LLM API). Cassette file is created. Second run replays. Responses are identical.
- **Full lifecycle (replay mode)**: Pre-create a cassette file. Run a test in replay mode. Verify that no HTTP requests are made and the correct response is returned.
- **Full lifecycle (record mode)**: Run a test in record mode. Verify that the real HTTP call is made and the cassette is written. Run again in record mode. Verify the cassette is overwritten.
- **Streaming lifecycle**: Record a streaming response. Replay it. Verify that the consumer receives chunks (not a single response body).
- **SDK-level interception**: Wrap an OpenAI client. Make a call. Verify the cassette captures the SDK-level request and response.
- **Multiple entries**: A test makes 3 API calls. The cassette has 3 entries. Replay returns the correct response for each.
- **Test framework integration**: Vitest `setupVCR` with automatic cassette naming. Verify cassette name matches test name. Verify beforeEach/afterEach lifecycle.

### Edge Cases

- Cassette file does not exist in `replay` mode: `CassetteNotFoundError` thrown.
- Cassette file is empty JSON (valid JSON but no entries): no matches found for any request.
- Concurrent `withCassette` calls in parallel tests: each test gets its own cassette (no shared state).
- Very large cassette file (10MB+): loads without timeout, matching completes in reasonable time.
- Request has no body (GET request to an LLM API): recorded and matched by URL and headers only.
- Response is not JSON (unexpected content type): raw body stored as string.
- Fetch is already patched by another library (e.g., msw): `llm-vcr` patches on top, restores correctly.
- Test throws before cassette is stopped: afterEach hook stops the cassette gracefully, incomplete cassettes are not written in record mode.

### Test Framework

Tests use Vitest, matching the project's existing `vitest run` configuration in `package.json`. Integration tests that simulate LLM APIs use a local HTTP server (Node.js `http.createServer`) that returns canned LLM-shaped responses, avoiding any dependency on real LLM providers.

---

## 18. Performance

### Replay Speed

Replay from a cassette involves reading a JSON file from disk and constructing a `Response` object from the recorded data. For non-streaming responses, this is effectively instant (under 1ms for typical cassettes). For streaming responses in `instant` mode, all chunks are emitted synchronously into the `ReadableStream` -- the only latency is the consumer's read speed.

| Operation | Expected Latency |
|-----------|-----------------|
| Cassette load (parse JSON) | < 5ms for typical cassettes (< 100KB) |
| Non-streaming replay | < 1ms per entry |
| Streaming replay (instant) | < 1ms total (chunks emitted without delay) |
| Streaming replay (realtime) | Original recording duration |
| Request matching (hash hit) | < 0.1ms |
| Request matching (full comparison) | < 1ms per entry |

### Cassette File Sizes

Cassette file size depends on the number of entries and the size of request/response payloads:

| Scenario | Approximate Size |
|----------|-----------------|
| Single non-streaming chat completion | 2-5 KB |
| Single streaming chat completion (short) | 5-15 KB |
| Single streaming chat completion (long, 1000+ tokens) | 30-100 KB |
| Test with 5 API calls | 10-50 KB |
| Full test suite cassettes (200 tests) | 2-10 MB total |

With `gzip: true`, cassettes compress to approximately 20-30% of their JSON size. However, gzip files are not human-readable and produce opaque git diffs, so plain JSON is the default.

### Memory Usage

During recording, `llm-vcr` buffers the full response in memory (including all streaming chunks) before writing to disk. For typical LLM responses (under 10KB of content), this is negligible. For very large responses (e.g., 100KB of generated code), the buffer is proportional to the response size. There is no unbounded memory growth -- each entry is a single request-response pair.

During replay, the entire cassette file is loaded into memory. A 1MB cassette file consumes approximately 2-3MB of memory (JSON parse overhead). For most test suites, this is well within acceptable bounds.

### Interception Overhead

The fetch interception wrapper adds approximately 0.01ms of overhead per non-LLM request (URL pattern check only). For LLM requests in replay mode, the overhead is the matching cost (under 1ms). The overhead is undetectable in practice.

---

## 19. Dependencies

### Runtime Dependencies

None. `llm-vcr` uses only Node.js built-in APIs:

| API | Purpose |
|-----|---------|
| `globalThis.fetch` | HTTP interception (patching and restoration) |
| `node:fs/promises` | Cassette file read/write |
| `node:path` | File path construction |
| `node:crypto` | SHA-256 hash for request matching |
| `node:http` / `node:https` | Optional HTTP interception (`interceptHttp: true`) |
| `ReadableStream` / `TransformStream` | Stream recording and replay |
| `util.parseArgs` | CLI argument parsing (Node.js 18+) |

### Peer Dependencies

None. Provider SDKs (OpenAI, Anthropic) are not peer dependencies. `llm-vcr` intercepts at the HTTP level by default and does not import or depend on any provider SDK. SDK-level interception (`wrapClient`) accepts any object and wraps it via Proxy -- no type dependency on the SDK.

### Development Dependencies

| Package | Purpose |
|---------|---------|
| `typescript` | TypeScript compiler |
| `vitest` | Test runner |
| `eslint` | Linter |
| `openai` | Used in integration tests for SDK-level interception testing |
| `@anthropic-ai/sdk` | Used in integration tests for Anthropic SDK-level interception testing |

### Compatibility

- Node.js >= 18 (requires `globalThis.fetch`, `ReadableStream`, `util.parseArgs`, `crypto.subtle`).
- TypeScript >= 5.0.
- Compatible with Jest >= 29, Vitest >= 1.0, and Mocha >= 10 as test framework hosts.
- Compatible with any LLM provider SDK that uses `fetch` or `http.request` for HTTP calls.

---

## 20. File Structure

```
llm-vcr/
  package.json
  tsconfig.json
  SPEC.md
  README.md
  src/
    index.ts                  Main entry point. Exports withCassette, useCassette,
                              createVCR, record, replay, and all types.
    types.ts                  All TypeScript interfaces and type definitions:
                              VCRConfig, Cassette, CassetteEntry, RecordedRequest,
                              RecordedResponse, StreamChunk, CassetteOptions, etc.
    vcr.ts                    LLMVcr class implementation. Manages configuration,
                              cassette lifecycle, client wrapping, and cassette queries.
    cassette.ts               Cassette read/write logic. JSON serialization,
                              deserialization, file naming, directory creation,
                              version checking, gzip support.
    interceptor/
      fetch.ts                Fetch interception. Patches globalThis.fetch, URL
                              pattern matching, request capture, response injection.
      http.ts                 Node.js http/https interception. Patches http.request
                              and https.request for legacy SDK compatibility.
      sdk.ts                  SDK-level interception. Proxy-based wrapping of
                              OpenAI and Anthropic client methods.
      manager.ts              Interception manager. Coordinates fetch, http, and
                              SDK interceptors. Ensures proper setup and teardown.
    matching/
      default.ts              Default matching strategy (model + messages).
      normalized.ts           Normalized matching (whitespace, parameter order).
      structural.ts           Structural matching (message shapes only).
      custom.ts               Custom matcher delegation.
      hash.ts                 SHA-256 hash computation and hash-based lookup.
      matcher.ts              Matcher dispatcher. Selects strategy, applies
                              threshold, handles ordered/unordered matching.
    streaming/
      recorder.ts             Stream recording. Tees a ReadableStream, buffers
                              chunks with timestamps, detects end-of-stream.
      replayer.ts             Stream replay. Constructs a ReadableStream from
                              recorded chunks with configurable timing.
      parsers/
        openai.ts             OpenAI SSE format parser and assembler.
        anthropic.ts          Anthropic SSE format parser and assembler.
        google.ts             Google SSE format parser and assembler.
        generic.ts            Generic SSE parser (no provider-specific logic).
    scrub.ts                  Sensitive data scrubbing. Header patterns, body
                              patterns, env var substitution, recursive field scrub.
    providers.ts              Provider detection from URL patterns. Default patterns
                              and custom pattern registration.
    errors.ts                 Custom error classes: CassetteMismatchError,
                              CassetteNotFoundError, CassetteCorruptError.
    frameworks/
      vitest.ts               Vitest setupVCR integration.
      jest.ts                 Jest setupVCR integration.
      mocha.ts                Mocha root hook plugin integration.
    cli.ts                    CLI entry point. Commands: list, inspect, clean,
                              rerecord, validate. Uses util.parseArgs.
  src/__tests__/
    vcr.test.ts               Core LLMVcr class tests.
    cassette.test.ts          Cassette file read/write tests.
    fetch-interceptor.test.ts Fetch interception tests.
    http-interceptor.test.ts  http/https interception tests.
    sdk-interceptor.test.ts   SDK-level interception tests.
    matching/
      default.test.ts         Default matching tests.
      normalized.test.ts      Normalized matching tests.
      structural.test.ts      Structural matching tests.
      custom.test.ts          Custom matcher tests.
      hash.test.ts            Hash-based matching tests.
    streaming/
      recorder.test.ts        Stream recording tests.
      replayer.test.ts        Stream replay tests (instant, realtime, scaled).
      parsers.test.ts         Provider-specific parser tests.
    scrub.test.ts             Scrubbing tests.
    providers.test.ts         Provider detection tests.
    errors.test.ts            Error class tests.
    integration.test.ts       Full lifecycle integration tests (record, replay,
                              auto mode) using a local mock HTTP server.
    streaming-integration.test.ts  Streaming lifecycle integration tests.
    cli.test.ts               CLI command tests.
  bin/
    llm-vcr.js                CLI binary entry point (#!/usr/bin/env node).
```

The `src/index.ts` exports:

```typescript
// Core functions
export { withCassette } from './vcr';
export { useCassette } from './vcr';
export { createVCR } from './vcr';
export { record } from './vcr';
export { replay } from './vcr';
export { LLMVcr } from './vcr';

// Types
export type {
  VCRConfig,
  VCRMode,
  CassetteOptions,
  Cassette,
  CassetteEntry,
  CassetteSummary,
  CassetteController,
  RecordedRequest,
  RecordedResponse,
  StreamChunk,
  AssembledResponse,
  EntryMetadata,
  ScrubConfig,
  MatchingConfig,
  MatcherFn,
  StreamingConfig,
  StreamParser,
  ProviderPattern,
} from './types';

// Errors
export {
  CassetteMismatchError,
  CassetteNotFoundError,
  CassetteCorruptError,
} from './errors';
```

Framework integrations are subpath exports:

```typescript
import { setupVCR } from 'llm-vcr/vitest';
import { setupVCR } from 'llm-vcr/jest';
import { setupVCR } from 'llm-vcr/mocha';
```

---

## 21. Implementation Roadmap

### Phase 1: Core Recording and Replay (v0.1.0)

Deliver the minimum viable VCR: fetch interception, cassette read/write, and basic matching.

**Order of implementation**:

1. **Types** (`types.ts`): Define all public types -- `VCRConfig`, `Cassette`, `CassetteEntry`, `RecordedRequest`, `RecordedResponse`, `StreamChunk`, `VCRMode`, `CassetteOptions`.
2. **Errors** (`errors.ts`): `CassetteMismatchError`, `CassetteNotFoundError`, `CassetteCorruptError`.
3. **Provider detection** (`providers.ts`): URL pattern matching for OpenAI, Anthropic, Google. Provider auto-detection.
4. **Scrubbing** (`scrub.ts`): Header scrubbing, body field scrubbing, default patterns, custom patterns.
5. **Cassette I/O** (`cassette.ts`): Write cassette to JSON file. Read cassette from JSON file. File naming. Directory creation. Version checking.
6. **Fetch interceptor** (`interceptor/fetch.ts`): Patch `globalThis.fetch`. URL matching. Request capture. Response injection. Non-streaming only in this phase.
7. **Default matching** (`matching/default.ts`): Model + messages comparison. Ignore auth headers.
8. **Hash matching** (`matching/hash.ts`): SHA-256 hash computation and lookup.
9. **Matcher dispatcher** (`matching/matcher.ts`): Strategy selection, ordered matching.
10. **VCR core** (`vcr.ts`): `LLMVcr` class, `withCassette`, `useCassette`, `createVCR`. All four modes.
11. **Entry point** (`index.ts`): Public exports.

### Phase 2: Streaming Support (v0.2.0)

Add streaming recording and replay.

1. **Stream recorder** (`streaming/recorder.ts`): Stream teeing, chunk buffering with timestamps, end-of-stream detection.
2. **Stream replayer** (`streaming/replayer.ts`): ReadableStream construction from recorded chunks. Instant, realtime, and scaled modes.
3. **OpenAI parser** (`streaming/parsers/openai.ts`): Parse OpenAI SSE chunks, detect `[DONE]`, assemble full response.
4. **Anthropic parser** (`streaming/parsers/anthropic.ts`): Parse Anthropic event-typed SSE, assemble full response.
5. **Google parser** (`streaming/parsers/google.ts`): Parse Google chunked responses.
6. **Generic parser** (`streaming/parsers/generic.ts`): Fallback SSE parser.
7. **Integration into fetch interceptor**: Detect streaming responses, route to stream recorder/replayer.

### Phase 3: Advanced Matching and SDK Interception (v0.3.0)

Add normalized/structural matching, custom matchers, unordered matching, and SDK-level interception.

1. **Normalized matching** (`matching/normalized.ts`): Whitespace normalization, parameter order normalization.
2. **Structural matching** (`matching/structural.ts`): Shape-only comparison.
3. **Custom matching** (`matching/custom.ts`): Custom matcher function delegation.
4. **Unordered matching**: Update matcher dispatcher to support unordered mode.
5. **SDK interceptor** (`interceptor/sdk.ts`): Proxy-based wrapping for OpenAI and Anthropic clients.
6. **HTTP interceptor** (`interceptor/http.ts`): Patch `http.request`/`https.request` for legacy compatibility.
7. **Interception manager** (`interceptor/manager.ts`): Coordinate multiple interceptors.

### Phase 4: Test Framework Integration (v0.4.0)

Add seamless integration with test frameworks.

1. **Vitest integration** (`frameworks/vitest.ts`): `setupVCR`, auto cassette naming, beforeEach/afterEach hooks.
2. **Jest integration** (`frameworks/jest.ts`): Same API as Vitest, Jest-specific state access.
3. **Mocha integration** (`frameworks/mocha.ts`): Root hook plugin pattern.
4. **Subpath exports**: Configure `package.json` exports map for `llm-vcr/vitest`, `llm-vcr/jest`, `llm-vcr/mocha`.

### Phase 5: CLI and Polish (v0.5.0)

Add cassette management CLI and production readiness.

1. **CLI** (`cli.ts`): `list`, `inspect`, `clean`, `rerecord`, `validate` commands. `util.parseArgs` for argument parsing.
2. **Gzip support**: Optional cassette compression.
3. **Environment variable placeholders**: Enhanced scrubbing with env var mapping.
4. **`transformEntry` hook**: Per-cassette entry transformation.
5. **Binary entry point** (`bin/llm-vcr.js`).

### Phase 6: Testing and Documentation (v1.0.0)

Production-ready release with comprehensive test suite and documentation.

1. Unit tests for all modules as described in section 17.
2. Integration tests with local mock HTTP server.
3. Performance benchmarks for matching and replay.
4. README with quick start, mode guide, provider guide, and API reference.
5. JSDoc comments on all public exports.
6. CHANGELOG.

---

## 22. Example Use Cases

### Example 1: Deterministic CI Testing

A team has an AI-powered customer support bot. Their test suite calls OpenAI's API to validate response quality. Without `llm-vcr`, running the suite in CI requires an `OPENAI_API_KEY` secret, costs $2-5 per run, and produces non-deterministic results.

**Setup**:

```typescript
// vitest.setup.ts
import { setupVCR } from 'llm-vcr/vitest';

setupVCR({
  cassettesDir: '__cassettes__',
  mode: process.env.CI ? 'replay' : 'auto',
});
```

**Test**:

```typescript
import { describe, it, expect } from 'vitest';
import { withCassette } from 'llm-vcr';
import { SupportBot } from '../src/bot.js';

describe('SupportBot', () => {
  it('handles refund requests', async () => {
    const response = await withCassette('handles-refund-requests', async () => {
      const bot = new SupportBot();
      return bot.respond('I want a refund for order #1234');
    });

    expect(response).toContain('refund');
    expect(response).toContain('1234');
  });
});
```

**Workflow**:
1. Developer runs `npm test` locally. First run: real API calls made, cassettes recorded.
2. Developer commits cassette files to git.
3. CI runs `npm test`. `LLM_VCR_MODE` defaults to `replay` in CI. No API calls, no secrets, deterministic output.
4. Developer changes the system prompt. Runs `LLM_VCR_MODE=record npm test` to re-record. Reviews cassette diffs in the PR.

### Example 2: Cost-Free Development

A developer is iterating on a feature that calls the Anthropic API. Each test run makes 15 API calls costing approximately $0.30.

```typescript
import { withCassette } from 'llm-vcr';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

it('generates product descriptions', async () => {
  const descriptions = await withCassette('product-descriptions', async () => {
    const results = [];
    for (const product of testProducts) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [{ role: 'user', content: `Describe: ${product.name}` }],
      });
      results.push(response.content[0].text);
    }
    return results;
  });

  expect(descriptions).toHaveLength(15);
  descriptions.forEach(d => expect(d.length).toBeGreaterThan(50));
});
```

First run: 15 API calls, $0.30, cassette recorded. Next 100 runs: $0.00 total, instant replay. The developer saves $30+ in API costs during feature development.

### Example 3: Testing Streaming UI

An application streams LLM responses to a chat UI with a typing indicator. Tests need to verify the streaming behavior.

```typescript
import { withCassette } from 'llm-vcr';
import OpenAI from 'openai';

const openai = new OpenAI();

it('streams response chunks to the UI', async () => {
  await withCassette('streaming-chat-ui', async () => {
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Tell me a joke' }],
      stream: true,
    });

    const chunks: string[] = [];
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) chunks.push(content);
    }

    expect(chunks.length).toBeGreaterThan(1); // Multiple chunks received
    expect(chunks.join('')).toContain('joke'); // Full content assembled
  });
}, { streaming: { replaySpeed: 'instant' } });
```

The cassette records the full SSE chunk sequence. On replay, chunks are emitted as a real `ReadableStream`, so the `for await` loop works identically. The streaming code path is fully exercised without a live API.

### Example 4: Recording Tool Call Conversations

An agent uses tool calls to interact with external services. Tests need to record the multi-turn conversation including tool call requests and tool results.

```typescript
import { withCassette } from 'llm-vcr';
import OpenAI from 'openai';

const openai = new OpenAI();

it('uses tools to answer weather questions', async () => {
  const answer = await withCassette('weather-tool-calls', async () => {
    // First API call: LLM decides to call the weather tool
    const response1 = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'What is the weather in Paris?' }],
      tools: [{ type: 'function', function: { name: 'get_weather', parameters: { type: 'object', properties: { city: { type: 'string' } } } } }],
    });

    const toolCall = response1.choices[0].message.tool_calls![0];

    // Second API call: LLM generates final answer with tool result
    const response2 = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: 'What is the weather in Paris?' },
        response1.choices[0].message,
        { role: 'tool', tool_call_id: toolCall.id, content: '{"temp": 18, "condition": "cloudy"}' },
      ],
    });

    return response2.choices[0].message.content;
  });

  expect(answer).toContain('Paris');
  expect(answer).toMatch(/18|cloudy/);
});
```

The cassette records both API calls as separate entries. On replay, each call is matched and replayed in order, including the tool call structure in the first response.

### Example 5: Comparing Model Outputs

A team is evaluating whether to switch from GPT-4o to Claude Sonnet. They record cassettes from both providers for the same prompts and compare.

```bash
# Record with OpenAI
LLM_VCR_MODE=record PROVIDER=openai npm test -- --cassettes-dir __cassettes__/openai

# Record with Anthropic
LLM_VCR_MODE=record PROVIDER=anthropic npm test -- --cassettes-dir __cassettes__/anthropic

# Inspect differences
npx llm-vcr inspect refund-request --dir __cassettes__/openai
npx llm-vcr inspect refund-request --dir __cassettes__/anthropic
```

The cassette files serve as a permanent record of each provider's output, enabling side-by-side comparison of response quality, token usage, latency, and cost.

### Example 6: Integration with prompt-snap for Regression Detection

A test suite combines `llm-vcr` for API call determinism with `prompt-snap` for fuzzy output comparison. This enables prompt engineers to change prompts and detect when outputs drift beyond acceptable thresholds, even when running against recorded cassettes.

```typescript
import { withCassette } from 'llm-vcr';
import { setupPromptSnap } from 'prompt-snap';

setupPromptSnap({ strategy: 'semantic', threshold: 0.85, embedFn: myEmbedder });

it('customer support tone is professional', async () => {
  const response = await withCassette('support-tone', async () => {
    return await supportBot.respond('Your product broke on day one.');
  });

  // prompt-snap compares the output semantically against the stored snapshot.
  // If the response is semantically similar (above 0.85 threshold), the test passes.
  // If the prompt change caused a significant tonal shift, the test fails.
  await expect(response).toMatchPromptSnapshot();
});
```

**Workflow when re-recording**:
1. Engineer changes the system prompt.
2. Runs `LLM_VCR_MODE=record npm test` to re-record cassettes.
3. `llm-vcr` records new API responses. `prompt-snap` compares new outputs against stored snapshots.
4. If outputs are semantically similar: tests pass, cassettes updated, snapshots unchanged.
5. If outputs drifted: `prompt-snap` fails with a diff showing the semantic distance. Engineer reviews and either adjusts the prompt or updates the snapshots with `--update-snapshots`.
