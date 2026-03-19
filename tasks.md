# llm-vcr -- Task Breakdown

This file tracks all implementation tasks derived from SPEC.md. Each task is granular, actionable, and grouped by logical phase.

---

## Phase 1: Project Scaffolding and Configuration

- [ ] **Install dev dependencies** -- Add `typescript`, `vitest`, `eslint`, `openai`, and `@anthropic-ai/sdk` as devDependencies in `package.json`. | Status: not_done
- [ ] **Configure package.json bin entry** -- Add `"bin": { "llm-vcr": "./bin/llm-vcr.js" }` to `package.json` for the CLI binary. | Status: not_done
- [ ] **Configure package.json exports map** -- Add subpath exports for `llm-vcr/vitest`, `llm-vcr/jest`, and `llm-vcr/mocha` pointing to their respective dist files. | Status: not_done
- [ ] **Create directory structure** -- Create all directories: `src/interceptor/`, `src/matching/`, `src/streaming/`, `src/streaming/parsers/`, `src/frameworks/`, `src/__tests__/`, `src/__tests__/matching/`, `src/__tests__/streaming/`, `bin/`. | Status: not_done
- [ ] **Configure ESLint** -- Add an `.eslintrc` or `eslint.config` file appropriate for the TypeScript source. | Status: not_done
- [ ] **Configure Vitest** -- Add a `vitest.config.ts` if needed, or confirm the `vitest run` script works with the existing `tsconfig.json`. | Status: not_done

---

## Phase 2: Type Definitions (`src/types.ts`)

- [ ] **Define VCRMode type** -- `type VCRMode = 'record' | 'replay' | 'auto' | 'passthrough'`. | Status: not_done
- [ ] **Define VCRConfig interface** -- Include all fields: `cassettesDir`, `mode`, `scrub`, `matching`, `streaming`, `providerPatterns`, `interceptHttp`, `recordErrors`, `gzip`, and `transformEntry` hook. | Status: not_done
- [ ] **Define ScrubConfig interface** -- Fields: `patterns` (RegExp[]), `bodyPatterns` (RegExp[]), `replacement` (string), `envVarMap` (Record<string, string>). | Status: not_done
- [ ] **Define MatchingConfig interface** -- Fields: `strategy` ('default' | 'normalized' | 'structural' | 'custom'), `matcher` (MatcherFn), `matchThreshold` (number), `order` ('ordered' | 'unordered'). | Status: not_done
- [ ] **Define MatcherFn type** -- `(request: RecordedRequest, entry: CassetteEntry) => number`. | Status: not_done
- [ ] **Define StreamingConfig interface** -- Field: `replaySpeed` ('instant' | 'realtime' | number). | Status: not_done
- [ ] **Define ProviderPattern interface** -- Fields: `name` (string), `pattern` (RegExp), `streamParser` (optional StreamParser). | Status: not_done
- [ ] **Define Cassette interface** -- Fields: `version` (number), `name` (string), `recordedAt` (string), `entries` (CassetteEntry[]). | Status: not_done
- [ ] **Define CassetteEntry interface** -- Fields: `request` (RecordedRequest), `response` (RecordedResponse), `metadata` (EntryMetadata). | Status: not_done
- [ ] **Define RecordedRequest interface** -- Fields: `provider` (string), `url` (string), `method` (string), `headers` (Record<string, string>), `body` (Record<string, unknown>). | Status: not_done
- [ ] **Define RecordedResponse interface** -- Fields: `status` (number), `headers` (Record<string, string>), `body?`, `streaming?` (boolean), `chunks?` (StreamChunk[]), `assembled?` (AssembledResponse), `streamError?` (boolean), `streamErrorMessage?` (string). | Status: not_done
- [ ] **Define StreamChunk interface** -- Fields: `data` (string), `event?` (string), `timestamp` (number). | Status: not_done
- [ ] **Define AssembledResponse interface** -- Fields: `content?` (string), `finish_reason?` (string), `usage?` (token counts), `tool_calls?` (array). | Status: not_done
- [ ] **Define EntryMetadata interface** -- Fields: `recordedAt` (string), `durationMs` (number), `requestHash` (string), `costEstimate?` (input/output tokens and USD). | Status: not_done
- [ ] **Define CassetteSummary interface** -- Fields: `name`, `filePath`, `entryCount`, `totalDurationMs`, `totalTokens`, `recordedAt`. | Status: not_done
- [ ] **Define CassetteOptions interface** -- Fields: `mode?`, `matching?`, `streaming?`, `transformEntry?`, `recordErrors?`. | Status: not_done
- [ ] **Define CassetteController interface** -- Fields: `start()`, `stop()`, `readonly state`, `readonly entries`. | Status: not_done
- [ ] **Define StreamParser interface** -- Methods: `parseChunk(data: string)`, `isEndOfStream(data: string)`, `assemble(chunks: unknown[])`. | Status: not_done

---

## Phase 3: Error Classes (`src/errors.ts`)

- [ ] **Implement CassetteMismatchError** -- Extends `Error`. Fields: `request` (RecordedRequest), `availableEntries` (array of entry + score). Include a descriptive message with unmatched request summary and available entries with match scores. | Status: not_done
- [ ] **Implement CassetteNotFoundError** -- Extends `Error`. Fields: `cassetteName` (string), `filePath` (string). Message indicates which cassette was expected and where. | Status: not_done
- [ ] **Implement CassetteCorruptError** -- Extends `Error`. Thrown when a cassette file contains invalid JSON or is missing required fields. Include the file path and parse error details. | Status: not_done

---

## Phase 4: Provider Detection (`src/providers.ts`)

- [ ] **Define default provider URL patterns** -- OpenAI: `api.openai.com/v1/*`. Azure OpenAI: `*.openai.azure.com/openai/deployments/*/chat/completions*`. Anthropic: `api.anthropic.com/v1/messages`. Google: both `generateContent` and `streamGenerateContent` patterns. | Status: not_done
- [ ] **Implement provider detection from URL** -- Given a URL string, return the provider name (`'openai'`, `'anthropic'`, `'google'`, or `'unknown'`). Check custom patterns first, then defaults. | Status: not_done
- [ ] **Support custom provider pattern registration** -- Accept an array of `ProviderPattern` objects from config and check them before built-in patterns. | Status: not_done
- [ ] **Implement URL match check** -- Given a URL, return true/false for whether it matches any known LLM provider endpoint (used by the fetch interceptor to decide whether to intercept). | Status: not_done

---

## Phase 5: Sensitive Data Scrubbing (`src/scrub.ts`)

- [ ] **Implement default header scrubbing** -- Scrub `authorization`, `api-key`, `x-api-key`, `openai-organization`, `openai-project` header values, replacing with `[SCRUBBED]`. | Status: not_done
- [ ] **Implement custom header pattern scrubbing** -- Accept additional `RegExp[]` patterns from `ScrubConfig.patterns` and scrub matching header names. | Status: not_done
- [ ] **Implement body field scrubbing** -- Recursively walk request body object. If a field name matches any pattern in `ScrubConfig.bodyPatterns`, replace its value with the replacement string. | Status: not_done
- [ ] **Implement env var placeholder substitution** -- Given an `envVarMap` (actual value -> placeholder), replace any occurrence of the actual value anywhere in the serialized cassette with the placeholder string. | Status: not_done
- [ ] **Implement configurable replacement string** -- Use `ScrubConfig.replacement` (default `'[SCRUBBED]'`) as the replacement value for all scrubbed fields. | Status: not_done
- [ ] **Ensure scrubbing only affects serialized output** -- Scrubbing must happen at write time. In-memory objects during recording must retain real values. | Status: not_done
- [ ] **Scrub response headers** -- Apply the same header scrubbing rules to response headers in cassette entries. | Status: not_done

---

## Phase 6: Cassette I/O (`src/cassette.ts`)

- [ ] **Implement cassette name sanitization** -- Convert cassette name to filesystem-safe filename: lowercase, replace spaces with hyphens, remove special characters, append `.cassette.json` extension. | Status: not_done
- [ ] **Implement cassette file path resolution** -- Given a cassette name and `cassettesDir`, resolve the full file path. Support both absolute and relative (to cwd) `cassettesDir`. | Status: not_done
- [ ] **Implement cassette directory creation** -- Auto-create the cassettes directory (and parent directories) if it does not exist when writing a cassette. | Status: not_done
- [ ] **Implement cassette write (JSON serialization)** -- Serialize a `Cassette` object to JSON with 2-space indentation. Apply scrubbing before writing. Write atomically (write to temp file, then rename). | Status: not_done
- [ ] **Implement cassette read (JSON deserialization)** -- Read a cassette JSON file from disk and parse it into a `Cassette` object. Throw `CassetteCorruptError` on invalid JSON. Throw `CassetteNotFoundError` if file does not exist (in replay mode). | Status: not_done
- [ ] **Implement cassette version checking** -- Read the `version` field. Emit a warning (console.warn) if the version is older than the current format version. Throw if the version is unrecognized/too new. | Status: not_done
- [ ] **Implement gzip support** -- When `gzip: true`, write cassettes as `.cassette.json.gz` using Node.js `zlib`. Read supports both gzipped and plain JSON transparently. | Status: not_done

---

## Phase 7: Request Matching

### Default Matching (`src/matching/default.ts`)

- [ ] **Implement model name matching** -- Exact string comparison of the `model` field. Return 0 if models differ. | Status: not_done
- [ ] **Implement messages array matching** -- Compare each message by `role` (exact match) and `content` (trimmed whitespace, collapsed internal whitespace). All messages must match in order. | Status: not_done
- [ ] **Implement parameter matching** -- Compare `temperature`, `top_p`, `max_tokens` / `max_completion_tokens` with exact number match when present in both request and entry. | Status: not_done
- [ ] **Implement tools/functions matching** -- Compare tool names and parameter schemas. Ignore description whitespace differences. | Status: not_done
- [ ] **Implement response_format matching** -- Match `type` field exactly. For `json_schema`, compare schema structure. | Status: not_done
- [ ] **Implement system prompt matching (Anthropic)** -- Compare top-level `system` field with normalized string match. | Status: not_done
- [ ] **Implement ignored fields** -- Ensure Authorization, `x-request-id`, `x-stainless-*`, `User-Agent`, `stream` parameter, and timestamp fields are never considered in matching. | Status: not_done

### Normalized Matching (`src/matching/normalized.ts`)

- [ ] **Implement whitespace normalization** -- Collapse all whitespace runs to single space, trim leading/trailing. | Status: not_done
- [ ] **Implement multi-part content normalization** -- Normalize each text part in array-type message content. | Status: not_done
- [ ] **Implement tool description ignoring** -- Skip tool descriptions entirely during comparison. | Status: not_done
- [ ] **Implement parameter order normalization** -- Compare JSON objects by sorted keys, ignoring key order. | Status: not_done

### Structural Matching (`src/matching/structural.ts`)

- [ ] **Implement structural shape comparison** -- Compare number of messages, role of each message, and content type (string, array, tool call) without comparing actual text content. | Status: not_done

### Custom Matching (`src/matching/custom.ts`)

- [ ] **Implement custom matcher delegation** -- Accept a `MatcherFn`, call it with `(request, entry)`, return the score. Validate that the function returns a number between 0 and 1. | Status: not_done

### Hash-Based Matching (`src/matching/hash.ts`)

- [ ] **Implement request hash computation** -- SHA-256 hash of canonicalized (sorted keys, scrubbed) request JSON using `node:crypto`. | Status: not_done
- [ ] **Implement hash-based lookup** -- Build a hash map from cassette entries' `requestHash` fields. Look up incoming request hash for O(1) matching. Fall back to full matching on hash miss. | Status: not_done

### Matcher Dispatcher (`src/matching/matcher.ts`)

- [ ] **Implement strategy selection** -- Route to default, normalized, structural, or custom matching based on `MatchingConfig.strategy`. | Status: not_done
- [ ] **Implement ordered matching** -- Compare the first unmatched request against the first unconsumed cassette entry. Consume entries sequentially. | Status: not_done
- [ ] **Implement unordered matching** -- Compare each request against all unconsumed entries. Select the entry with the highest score above `matchThreshold`. | Status: not_done
- [ ] **Implement match threshold** -- Only accept matches with scores >= `matchThreshold` (default 0.8). | Status: not_done
- [ ] **Implement hash-first lookup** -- Try hash-based matching first, fall back to the configured strategy on miss. | Status: not_done

---

## Phase 8: Fetch Interceptor (`src/interceptor/fetch.ts`)

- [ ] **Implement fetch patching** -- Store reference to original `globalThis.fetch`, replace with wrapper function. | Status: not_done
- [ ] **Implement fetch restoration** -- Restore original `globalThis.fetch` when cassette is deactivated. Handle case where fetch was already patched by another library. | Status: not_done
- [ ] **Implement URL pattern matching in wrapper** -- Check each outgoing request URL against provider patterns. Pass through non-matching requests to original fetch. | Status: not_done
- [ ] **Implement request capture (record mode)** -- Forward request to real fetch, capture the response (body, headers, status), construct a `RecordedRequest` and `RecordedResponse`, store as a cassette entry. | Status: not_done
- [ ] **Implement response injection (replay mode)** -- Match request against cassette entries, construct a synthetic `Response` object from recorded data (status, headers, body as JSON string), return it. | Status: not_done
- [ ] **Implement auto mode logic** -- Attempt replay first. If no match found and cassette exists, record the new interaction and append. If no cassette exists, record all. | Status: not_done
- [ ] **Implement passthrough mode** -- Do not intercept. Forward all requests to original fetch unmodified. | Status: not_done
- [ ] **Implement non-streaming response capture** -- Read response body as JSON, store in `RecordedResponse.body`. | Status: not_done
- [ ] **Implement streaming response detection** -- Check `Content-Type: text/event-stream` to identify streaming responses. | Status: not_done
- [ ] **Implement error response handling** -- When `recordErrors: false` (default), propagate errors and do not write cassette. When `recordErrors: true`, record 4xx/5xx responses as entries. | Status: not_done
- [ ] **Handle concurrent cassette prevention** -- Throw an error if a second cassette is activated while one is already active. | Status: not_done
- [ ] **Handle already-patched fetch** -- If `globalThis.fetch` is already patched (e.g., by msw), patch on top and restore correctly (restore to the state before llm-vcr patched, not necessarily the original built-in fetch). | Status: not_done

---

## Phase 9: Streaming Support

### Stream Recorder (`src/streaming/recorder.ts`)

- [ ] **Implement stream teeing** -- Use `body.tee()` to produce two identical ReadableStreams from the original response. Return one to the caller, consume the other for recording. | Status: not_done
- [ ] **Implement chunk buffering with timestamps** -- Buffer each SSE chunk with a `timestamp` (milliseconds since the first chunk). Parse the SSE `data:` lines. | Status: not_done
- [ ] **Implement end-of-stream detection** -- Detect `[DONE]` sentinel (OpenAI), stream close (Google), or `message_stop` event (Anthropic) to know when recording is complete. | Status: not_done
- [ ] **Implement stream error recording** -- If the stream errors mid-way, store chunks received so far, mark entry with `streamError: true` and the error message. | Status: not_done
- [ ] **Handle empty streams** -- If a streaming content-type response has zero chunks, store an empty `chunks` array. | Status: not_done

### Stream Replayer (`src/streaming/replayer.ts`)

- [ ] **Implement instant replay mode** -- Construct a `ReadableStream` that emits all recorded chunks immediately with no delay. | Status: not_done
- [ ] **Implement realtime replay mode** -- Emit chunks with the original inter-chunk delays from the `timestamp` field. | Status: not_done
- [ ] **Implement scaled replay mode** -- Emit chunks with delays scaled by a configurable factor (e.g., 10x faster: 45ms gap becomes 4.5ms). | Status: not_done
- [ ] **Construct synthetic streaming Response** -- Build a `Response` object with `Content-Type: text/event-stream` and a `ReadableStream` body for replay. | Status: not_done
- [ ] **Replay stream errors** -- If `streamError: true`, emit recorded chunks up to the error point, then emit the error at the correct position in the stream. | Status: not_done

### Streaming Integration with Fetch Interceptor

- [ ] **Route streaming responses to stream recorder** -- In record mode, detect streaming content-type and use the stream recorder instead of buffering the full body. | Status: not_done
- [ ] **Route streaming entries to stream replayer** -- In replay mode, detect `streaming: true` in cassette entry and use the stream replayer to construct the response. | Status: not_done

### Provider-Specific SSE Parsers

#### OpenAI Parser (`src/streaming/parsers/openai.ts`)

- [ ] **Parse OpenAI SSE chunks** -- Parse `data:` lines as JSON. Extract `choices[].delta` content. | Status: not_done
- [ ] **Detect OpenAI end-of-stream** -- Detect `data: [DONE]` sentinel. | Status: not_done
- [ ] **Assemble OpenAI full response** -- Combine all deltas into complete `content`, extract `finish_reason`, extract `usage` from final chunk (if present). | Status: not_done

#### Anthropic Parser (`src/streaming/parsers/anthropic.ts`)

- [ ] **Parse Anthropic event-typed SSE** -- Handle `message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop` events. | Status: not_done
- [ ] **Extract Anthropic content** -- Extract text from `content_block_delta` events (`delta.text` or `delta.partial_json`). | Status: not_done
- [ ] **Assemble Anthropic full response** -- Combine content blocks. Extract input tokens from `message_start`, output tokens from `message_delta`. | Status: not_done

#### Google Parser (`src/streaming/parsers/google.ts`)

- [ ] **Parse Google chunked responses** -- Each chunk is a complete `GenerateContentResponse` JSON (not deltas). | Status: not_done
- [ ] **Detect Google end-of-stream** -- No explicit sentinel; stream closes naturally. | Status: not_done
- [ ] **Assemble Google full response** -- Combine content from all chunks, extract usage data. | Status: not_done

#### Generic Parser (`src/streaming/parsers/generic.ts`)

- [ ] **Implement generic SSE parser** -- Parse standard `data:` lines without provider-specific logic. Buffer raw data. | Status: not_done
- [ ] **Implement generic assembly** -- Concatenate all `data` payloads as best-effort content. Mark assembled response as incomplete. | Status: not_done

---

## Phase 10: SDK-Level Interception (`src/interceptor/sdk.ts`)

- [ ] **Implement Proxy-based client wrapping** -- `wrapClient(client)` returns a `Proxy` that intercepts specific method calls. | Status: not_done
- [ ] **Intercept OpenAI SDK methods** -- Intercept `chat.completions.create`, `completions.create`, `embeddings.create`. Record typed request/response objects. | Status: not_done
- [ ] **Intercept Anthropic SDK methods** -- Intercept `messages.create` and `messages.stream`. Handle Anthropic streaming helpers (`.on('text')`, `.finalMessage()`). | Status: not_done
- [ ] **Handle SDK-level streaming** -- When intercepted SDK methods return streaming iterators/helpers, record the stream and replay it with the correct SDK-level interface. | Status: not_done
- [ ] **Ensure SDK interception takes priority over HTTP** -- If a call is captured at SDK level, the fetch interceptor must not also capture it. | Status: not_done

---

## Phase 11: HTTP Interceptor (`src/interceptor/http.ts`)

- [ ] **Implement http.request patching** -- Patch `http.request` and `https.request` to intercept outgoing requests matching LLM provider URLs. | Status: not_done
- [ ] **Implement http.ClientRequest wrapping** -- Wrap `ClientRequest` to capture request body, response status, headers, and body. | Status: not_done
- [ ] **Implement http restoration** -- Restore original `http.request` and `https.request` on cassette deactivation. | Status: not_done
- [ ] **Gate behind interceptHttp config** -- Only activate http/https interception when `interceptHttp: true` is set in config. | Status: not_done

---

## Phase 12: Interception Manager (`src/interceptor/manager.ts`)

- [ ] **Implement interception coordinator** -- Manage the lifecycle of fetch, http, and SDK interceptors. Ensure proper setup order and teardown order. | Status: not_done
- [ ] **Implement setup (activate interceptors)** -- Based on config, activate the appropriate interceptors when a cassette starts. | Status: not_done
- [ ] **Implement teardown (deactivate interceptors)** -- Restore all patched globals when a cassette stops. Ensure teardown runs even if the test throws. | Status: not_done
- [ ] **Prevent nested cassettes** -- Throw an error if `start()` is called while another cassette is already active. | Status: not_done

---

## Phase 13: VCR Core (`src/vcr.ts`)

- [ ] **Implement LLMVcr class constructor** -- Accept `VCRConfig`, merge with defaults, resolve environment variable overrides (`LLM_VCR_MODE`, `LLM_VCR_DIR`, `LLM_VCR_UPDATE`). | Status: not_done
- [ ] **Implement default config values** -- Apply all defaults from spec section 14: `cassettesDir: '__cassettes__'`, `mode: 'auto'`, default scrub/matching/streaming configs. | Status: not_done
- [ ] **Implement environment variable overrides** -- `LLM_VCR_MODE` overrides mode. `LLM_VCR_DIR` overrides cassettesDir. `LLM_VCR_UPDATE=1/true/yes` sets mode to `record`. | Status: not_done
- [ ] **Implement withCassette method** -- Activate cassette, run fn, deactivate cassette, write cassette if recording. Handle errors gracefully (deactivate even on throw). | Status: not_done
- [ ] **Implement useCassette method** -- Return a `CassetteController` object with `start()`, `stop()`, `state`, and `entries` properties. | Status: not_done
- [ ] **Implement record mode behavior** -- Forward all LLM calls to real API. Overwrite cassette file on completion. Do not write if any API call fails (unless `recordErrors: true`). | Status: not_done
- [ ] **Implement replay mode behavior** -- Load cassette from file. Match each request against entries. Throw `CassetteNotFoundError` if file missing. Throw `CassetteMismatchError` if no match. | Status: not_done
- [ ] **Implement auto mode behavior** -- If cassette file exists, attempt replay. On miss, record the new call and append. If no file, record all. Write updated cassette on completion if new entries added. | Status: not_done
- [ ] **Implement passthrough mode behavior** -- Do not intercept any calls. No cassette read or write. | Status: not_done
- [ ] **Implement wrapClient method** -- Delegate to SDK interceptor. Return a Proxy-wrapped client. | Status: not_done
- [ ] **Implement listCassettes method** -- Scan cassettes directory, parse each file's metadata, return `CassetteSummary[]`. | Status: not_done
- [ ] **Implement loadCassette method** -- Read and parse a specific cassette file by name. | Status: not_done
- [ ] **Implement deleteCassette method** -- Delete a cassette file by name from the cassettes directory. | Status: not_done
- [ ] **Implement rerecordCassette method** -- Run the provided function in record mode, overwriting the existing cassette. | Status: not_done
- [ ] **Implement findStaleCassettes method** -- Scan test files matching a glob for cassette name references. Compare against cassette files on disk. Return unreferenced cassette names. | Status: not_done
- [ ] **Implement transformEntry hook** -- If `transformEntry` is provided in config or per-cassette options, apply it to each entry before writing. If the hook returns `null`, exclude the entry. | Status: not_done

### Top-Level Convenience Functions

- [ ] **Implement standalone withCassette function** -- Create a default `LLMVcr` instance (or reuse a singleton) and delegate to its `withCassette`. | Status: not_done
- [ ] **Implement standalone useCassette function** -- Create/reuse default instance and delegate. | Status: not_done
- [ ] **Implement standalone createVCR function** -- Construct and return a new `LLMVcr` instance. | Status: not_done
- [ ] **Implement standalone record function** -- Convenience for SDK-level recording. Wrap client and record to a cassette path. | Status: not_done
- [ ] **Implement standalone replay function** -- Convenience for activating replay mode for a specific cassette path. Return `{ start(), stop() }`. | Status: not_done

---

## Phase 14: Entry Point (`src/index.ts`)

- [ ] **Export core functions** -- Export `withCassette`, `useCassette`, `createVCR`, `record`, `replay`, and `LLMVcr` from `./vcr`. | Status: not_done
- [ ] **Export all types** -- Export all interfaces and types from `./types` using `export type`. | Status: not_done
- [ ] **Export error classes** -- Export `CassetteMismatchError`, `CassetteNotFoundError`, `CassetteCorruptError` from `./errors`. | Status: not_done

---

## Phase 15: Test Framework Integration

### Vitest Integration (`src/frameworks/vitest.ts`)

- [ ] **Implement setupVCR for Vitest** -- Install global `beforeEach`/`afterEach` hooks that manage cassette lifecycle. Accept config options. | Status: not_done
- [ ] **Implement automatic cassette naming from test name** -- Derive cassette name from `describe name > it name`, sanitize for filesystem. | Status: not_done
- [ ] **Support --update-cassettes flag** -- Detect `--update-cassettes` CLI flag or `LLM_VCR_MODE=record` to force re-recording. | Status: not_done

### Jest Integration (`src/frameworks/jest.ts`)

- [ ] **Implement setupVCR for Jest** -- Same API as Vitest. Use Jest `beforeEach`/`afterEach` globals and `expect.getState().currentTestName` for automatic cassette naming. | Status: not_done

### Mocha Integration (`src/frameworks/mocha.ts`)

- [ ] **Implement setupVCR for Mocha** -- Export root-level hooks via Mocha's root hook plugin pattern. Use `this.currentTest.fullTitle()` for cassette naming. | Status: not_done

---

## Phase 16: CLI (`src/cli.ts` and `bin/llm-vcr.js`)

- [ ] **Create CLI binary entry point** -- Create `bin/llm-vcr.js` with `#!/usr/bin/env node` shebang that requires `../dist/cli.js`. | Status: not_done
- [ ] **Implement CLI argument parsing** -- Use `node:util.parseArgs` to parse commands and options. Support `--dir`, `--json`, `--dry-run`, `--test-glob`, `--entry` flags. | Status: not_done
- [ ] **Implement `llm-vcr list` command** -- List all cassette files in the cassettes directory. Show human-readable summary (entries, tokens, duration, date). Support `--json` for machine-readable output. | Status: not_done
- [ ] **Implement `llm-vcr inspect <name>` command** -- Display cassette contents in human-readable format: provider, model, messages, response summary, tokens, duration, cost. Support `--entry <index>` to show a single entry. Support `--json`. | Status: not_done
- [ ] **Implement `llm-vcr clean` command** -- Scan test files for cassette name references. Delete unreferenced cassette files. Support `--test-glob` to customize test file pattern. Support `--dry-run` to report without deleting. | Status: not_done
- [ ] **Implement `llm-vcr rerecord <name>` command** -- Set `LLM_VCR_MODE=record` and run the test associated with the cassette. Discover the test by searching test files for the cassette name. | Status: not_done
- [ ] **Implement `llm-vcr validate` command** -- Validate all cassette files: check JSON syntax, verify version compatibility, confirm required fields. Exit 0 if all valid, exit 1 if any invalid. | Status: not_done

---

## Phase 17: Cassette File Format Details

- [ ] **Implement assembled response generation for non-streaming** -- For non-streaming responses, the body is stored directly. No assembly needed. Ensure the structure matches the spec. | Status: not_done
- [ ] **Implement assembled response generation for streaming** -- After recording all chunks, assemble the full response (content, finish_reason, usage, tool_calls) using the appropriate provider parser. Store in `assembled` field. | Status: not_done
- [ ] **Implement cost estimate computation** -- Compute `costEstimate` from the response's `usage` field and model pricing (best-effort). Store in entry metadata. | Status: not_done
- [ ] **Implement format version 1** -- Set `version: 1` on all newly written cassettes. Define the complete v1 schema. | Status: not_done

---

## Phase 18: Configuration Resolution

- [ ] **Implement configuration merge logic** -- Merge in order: built-in defaults -> `createVCR` config -> environment variables -> per-cassette options. Later overrides earlier. | Status: not_done
- [ ] **Implement per-cassette option override** -- `CassetteOptions` passed to `withCassette` or `useCassette` override the VCR instance's global config for that cassette only. | Status: not_done

---

## Phase 19: Edge Case Handling

- [ ] **Handle test throw before cassette stop** -- If the function passed to `withCassette` throws, ensure the cassette is deactivated and interceptors are restored. In record mode, do not write incomplete cassettes. | Status: not_done
- [ ] **Handle unused cassette entries in auto mode** -- Preserve unused entries when replaying in auto mode (do not delete entries that were not matched). | Status: not_done
- [ ] **Handle concurrent withCassette calls** -- Each test must get its own cassette scope. Prevent shared state between parallel tests. Throw if nested cassettes are attempted. | Status: not_done
- [ ] **Handle very large cassette files** -- Ensure cassettes over 10MB load without timeout and matching completes in reasonable time. | Status: not_done
- [ ] **Handle GET requests to LLM APIs** -- Record and match by URL and headers only when body is absent. | Status: not_done
- [ ] **Handle non-JSON response bodies** -- If response content-type is not JSON, store raw body as a string. | Status: not_done
- [ ] **Handle empty JSON cassette** -- Valid JSON with no entries should result in no matches (not an error in auto mode, error in replay mode). | Status: not_done
- [ ] **Handle cassette file with old version** -- Read with a warning, do not error. Write in latest version. | Status: not_done

---

## Phase 20: Unit Tests

### VCR Core Tests (`src/__tests__/vcr.test.ts`)

- [ ] **Test withCassette record mode** -- Verify real API call is made (mock HTTP server), cassette file is written with correct structure. | Status: not_done
- [ ] **Test withCassette replay mode** -- Pre-create a cassette file. Verify no HTTP request is made. Verify correct response is returned. | Status: not_done
- [ ] **Test withCassette auto mode (no existing cassette)** -- Verify recording happens and cassette is created. | Status: not_done
- [ ] **Test withCassette auto mode (existing cassette, match)** -- Verify replay from existing cassette, no API call. | Status: not_done
- [ ] **Test withCassette auto mode (existing cassette, no match)** -- Verify new call is recorded and appended. | Status: not_done
- [ ] **Test withCassette passthrough mode** -- Verify no interception, no cassette read/write. | Status: not_done
- [ ] **Test useCassette start/stop lifecycle** -- Verify state transitions: idle -> active -> stopped. | Status: not_done
- [ ] **Test createVCR with custom config** -- Verify config is applied to all cassettes created from the instance. | Status: not_done
- [ ] **Test environment variable overrides** -- Verify `LLM_VCR_MODE`, `LLM_VCR_DIR`, `LLM_VCR_UPDATE` override config. | Status: not_done
- [ ] **Test error propagation in withCassette** -- Verify that errors thrown in fn propagate, and cassette is properly deactivated. | Status: not_done
- [ ] **Test multiple entries in single cassette** -- Make 3 API calls, verify cassette has 3 entries. Replay returns correct response for each. | Status: not_done

### Cassette I/O Tests (`src/__tests__/cassette.test.ts`)

- [ ] **Test cassette write produces valid JSON** -- Write a cassette, read the file, verify it parses as valid JSON with correct structure. | Status: not_done
- [ ] **Test cassette read parses correctly** -- Create a valid cassette JSON file, read it, verify all fields are present. | Status: not_done
- [ ] **Test cassette name sanitization** -- Spaces to hyphens, special chars removed, lowercased. Test multiple edge cases. | Status: not_done
- [ ] **Test missing file in replay mode throws CassetteNotFoundError** -- Attempt to read a non-existent cassette in replay mode. | Status: not_done
- [ ] **Test missing file in auto mode creates new cassette** -- Verify new file is created. | Status: not_done
- [ ] **Test corrupt JSON throws CassetteCorruptError** -- Write invalid JSON to a cassette file, attempt to read. | Status: not_done
- [ ] **Test version checking** -- Old version triggers warning. Unrecognized version throws. | Status: not_done
- [ ] **Test directory auto-creation** -- Write a cassette to a non-existent directory, verify directory is created. | Status: not_done
- [ ] **Test gzip write and read** -- Write with `gzip: true`, verify file is gzipped. Read it back, verify data matches. | Status: not_done

### Fetch Interceptor Tests (`src/__tests__/fetch-interceptor.test.ts`)

- [ ] **Test fetch is patched when cassette is active** -- Verify `globalThis.fetch` is different from the original. | Status: not_done
- [ ] **Test fetch is restored when cassette is deactivated** -- Verify `globalThis.fetch` is restored to original. | Status: not_done
- [ ] **Test LLM URLs are intercepted** -- Make a fetch to `api.openai.com`, verify it is captured. | Status: not_done
- [ ] **Test non-LLM URLs pass through** -- Make a fetch to `example.com`, verify it reaches the original fetch. | Status: not_done
- [ ] **Test activating second cassette throws** -- Activate one cassette, try to activate another, verify error. | Status: not_done
- [ ] **Test nested withCassette throws** -- Call withCassette inside another withCassette, verify error. | Status: not_done

### HTTP Interceptor Tests (`src/__tests__/http-interceptor.test.ts`)

- [ ] **Test http.request is patched when interceptHttp is true** -- Verify patching occurs. | Status: not_done
- [ ] **Test http.request is not patched when interceptHttp is false** -- Verify no patching. | Status: not_done
- [ ] **Test http.request and https.request are restored on deactivation** -- Verify originals restored. | Status: not_done

### SDK Interceptor Tests (`src/__tests__/sdk-interceptor.test.ts`)

- [ ] **Test wrapClient returns a Proxy** -- Verify the returned object intercepts method calls. | Status: not_done
- [ ] **Test OpenAI chat.completions.create is intercepted** -- Call the wrapped method, verify recording/replay. | Status: not_done
- [ ] **Test Anthropic messages.create is intercepted** -- Call the wrapped method, verify recording/replay. | Status: not_done
- [ ] **Test non-intercepted methods pass through** -- Call a method not in the intercepted list, verify it is not captured. | Status: not_done

### Matching Tests (`src/__tests__/matching/`)

- [ ] **Test default matching: identical requests match** -- Same model, messages, params -> score 1.0. | Status: not_done
- [ ] **Test default matching: different API key still matches** -- Requests differing only in auth header -> match. | Status: not_done
- [ ] **Test default matching: different model does not match** -- `gpt-4o` vs `gpt-3.5-turbo` -> score 0. | Status: not_done
- [ ] **Test default matching: different messages do not match** -- Different user message content -> score 0. | Status: not_done
- [ ] **Test normalized matching: whitespace differences match** -- Extra spaces/newlines -> match. | Status: not_done
- [ ] **Test normalized matching: parameter order differences match** -- Same keys in different order -> match. | Status: not_done
- [ ] **Test structural matching: same shape matches** -- Same roles and message count, different content -> match. | Status: not_done
- [ ] **Test structural matching: different shape does not match** -- Different number of messages -> no match. | Status: not_done
- [ ] **Test custom matcher: function is called correctly** -- Verify args and return value are used. | Status: not_done
- [ ] **Test custom matcher: score above threshold passes** -- Score 0.9 with threshold 0.8 -> match. | Status: not_done
- [ ] **Test custom matcher: score below threshold fails** -- Score 0.5 with threshold 0.8 -> no match. | Status: not_done
- [ ] **Test hash matching: exact match found via hash** -- Pre-compute hash, verify O(1) lookup. | Status: not_done
- [ ] **Test hash matching: miss falls through to full matching** -- Hash miss, full matching succeeds. | Status: not_done
- [ ] **Test ordered matching: entries consumed in order** -- 3 entries, 3 requests in order -> all match. | Status: not_done
- [ ] **Test ordered matching: out-of-order fails** -- 3 entries, requests in different order -> fail. | Status: not_done
- [ ] **Test unordered matching: best match selected** -- 3 entries, requests in any order -> each matches best entry. | Status: not_done

### Scrubbing Tests (`src/__tests__/scrub.test.ts`)

- [ ] **Test default Authorization header scrubbing** -- Verify `Bearer sk-xxx` is replaced with `[SCRUBBED]`. | Status: not_done
- [ ] **Test default api-key header scrubbing** -- Verify `api-key` and `x-api-key` values are scrubbed. | Status: not_done
- [ ] **Test custom header pattern scrubbing** -- Add custom pattern, verify matching headers are scrubbed. | Status: not_done
- [ ] **Test body field pattern scrubbing** -- Add body pattern `/password/i`, verify matching fields are scrubbed recursively. | Status: not_done
- [ ] **Test env var placeholder substitution** -- Map real key to `${OPENAI_API_KEY}`, verify replacement in serialized output. | Status: not_done
- [ ] **Test nested body field scrubbing** -- Deeply nested object with sensitive field names is scrubbed recursively. | Status: not_done
- [ ] **Test scrubbing does not modify in-memory objects** -- Verify original objects retain real values after scrubbing. | Status: not_done
- [ ] **Test response header scrubbing** -- Verify sensitive response headers are also scrubbed. | Status: not_done
- [ ] **Test custom replacement string** -- Set `replacement: '[REDACTED]'`, verify it is used instead of `[SCRUBBED]`. | Status: not_done

### Streaming Tests (`src/__tests__/streaming/`)

- [ ] **Test stream recording captures all chunks** -- Record a multi-chunk SSE stream, verify all chunks stored with data and timestamps. | Status: not_done
- [ ] **Test stream recording preserves inter-chunk timing** -- Verify timestamps are monotonically increasing and approximate real timing. | Status: not_done
- [ ] **Test instant replay emits all chunks immediately** -- Replay with `replaySpeed: 'instant'`, verify all chunks emitted with no delay. | Status: not_done
- [ ] **Test realtime replay preserves timing** -- Replay with `replaySpeed: 'realtime'`, verify inter-chunk delays match original (within tolerance). | Status: not_done
- [ ] **Test scaled replay applies speed multiplier** -- Replay with `replaySpeed: 10`, verify delays are 1/10th of original. | Status: not_done
- [ ] **Test stream error is recorded and replayed** -- Record a stream that errors, verify error is replayed at same position. | Status: not_done
- [ ] **Test empty stream handling** -- Record/replay a stream with zero chunks. | Status: not_done
- [ ] **Test assembled response from OpenAI chunks** -- Verify content, finish_reason, usage are correctly assembled. | Status: not_done
- [ ] **Test assembled response from Anthropic events** -- Verify content and split usage (input from message_start, output from message_delta) are assembled. | Status: not_done
- [ ] **Test assembled response from Google chunks** -- Verify content assembled from complete response chunks. | Status: not_done

### Provider Tests (`src/__tests__/providers.test.ts`)

- [ ] **Test OpenAI URL detection** -- `api.openai.com/v1/chat/completions` -> `'openai'`. | Status: not_done
- [ ] **Test Azure OpenAI URL detection** -- `*.openai.azure.com/openai/deployments/*/chat/completions` -> `'openai'`. | Status: not_done
- [ ] **Test Anthropic URL detection** -- `api.anthropic.com/v1/messages` -> `'anthropic'`. | Status: not_done
- [ ] **Test Google URL detection** -- Both `generateContent` and `streamGenerateContent` URLs -> `'google'`. | Status: not_done
- [ ] **Test unknown URL detection** -- `api.example.com/v1/chat` -> `'unknown'`. | Status: not_done
- [ ] **Test custom provider pattern** -- Register custom pattern, verify detection works. | Status: not_done

### Error Tests (`src/__tests__/errors.test.ts`)

- [ ] **Test CassetteMismatchError structure** -- Verify it has `request` and `availableEntries` fields, descriptive message. | Status: not_done
- [ ] **Test CassetteNotFoundError structure** -- Verify it has `cassetteName` and `filePath` fields. | Status: not_done
- [ ] **Test CassetteCorruptError structure** -- Verify it includes file path and parse error details. | Status: not_done

---

## Phase 21: Integration Tests

### Full Lifecycle Tests (`src/__tests__/integration.test.ts`)

- [ ] **Integration test: auto mode full lifecycle** -- Set up mock HTTP server simulating LLM API. First run records cassette. Second run replays. Verify responses are identical. | Status: not_done
- [ ] **Integration test: replay mode with pre-created cassette** -- Create cassette file manually. Run in replay mode. Verify no HTTP requests made. Verify correct response. | Status: not_done
- [ ] **Integration test: record mode overwrites cassette** -- Run in record mode twice. Verify cassette is overwritten each time. | Status: not_done
- [ ] **Integration test: multiple entries** -- Test makes 3 API calls. Verify cassette has 3 entries. Replay all 3 correctly. | Status: not_done
- [ ] **Integration test: auto mode appends new entries** -- Record 2 entries. Add a third API call. Run again in auto mode. Verify cassette now has 3 entries. | Status: not_done
- [ ] **Integration test: replay mode with no match throws CassetteMismatchError** -- Pre-create cassette. Make a request that doesn't match. Verify error. | Status: not_done
- [ ] **Integration test: replay mode with missing cassette throws CassetteNotFoundError** -- Run in replay mode with no cassette file. | Status: not_done

### Streaming Integration Tests (`src/__tests__/streaming-integration.test.ts`)

- [ ] **Integration test: streaming record and replay** -- Record a streaming response from mock server. Replay it. Verify chunks are received as a stream (not single body). | Status: not_done
- [ ] **Integration test: streaming with OpenAI format** -- Mock server returns OpenAI-format SSE. Record and replay. Verify chunk structure. | Status: not_done
- [ ] **Integration test: streaming with Anthropic format** -- Mock server returns Anthropic-format SSE. Record and replay. Verify event types preserved. | Status: not_done

### CLI Tests (`src/__tests__/cli.test.ts`)

- [ ] **Test `llm-vcr list` output** -- Create cassette files, run list command, verify output format. | Status: not_done
- [ ] **Test `llm-vcr list --json` output** -- Verify JSON array of CassetteSummary objects. | Status: not_done
- [ ] **Test `llm-vcr inspect` output** -- Create a cassette, run inspect, verify human-readable output with all fields. | Status: not_done
- [ ] **Test `llm-vcr inspect --entry` output** -- Verify only the specified entry is shown. | Status: not_done
- [ ] **Test `llm-vcr validate` with valid cassettes** -- Exit code 0. | Status: not_done
- [ ] **Test `llm-vcr validate` with invalid cassette** -- Exit code 1, error details on stderr. | Status: not_done
- [ ] **Test `llm-vcr clean --dry-run`** -- Verify stale cassettes are reported but not deleted. | Status: not_done
- [ ] **Test `llm-vcr clean` deletes unreferenced cassettes** -- Verify stale cassettes are deleted, referenced ones preserved. | Status: not_done

---

## Phase 22: Mock HTTP Server for Tests

- [ ] **Implement local mock LLM server** -- Create a `http.createServer` that returns canned LLM-shaped responses (OpenAI format). Support non-streaming and streaming (SSE) endpoints. Used by integration tests. No real LLM provider dependency. | Status: not_done
- [ ] **Implement Anthropic-format mock responses** -- Add mock endpoint returning Anthropic event-typed SSE format. | Status: not_done
- [ ] **Implement configurable mock responses** -- Allow tests to set what the mock server returns (custom content, tool calls, error responses, etc.). | Status: not_done

---

## Phase 23: Documentation

- [ ] **Write README.md** -- Quick start guide, installation, basic usage with `withCassette`, mode guide, provider guide, configuration reference, CLI reference, test framework integration guide, API reference for all public exports. | Status: not_done
- [ ] **Add JSDoc comments to all public exports** -- Document every exported function, class, interface, and type with JSDoc. Include `@param`, `@returns`, `@example` where appropriate. | Status: not_done
- [ ] **Version bump in package.json** -- Bump version appropriately for the initial feature release (currently at 0.1.0 as per spec phase 1). | Status: not_done

---

## Phase 24: Build and Publish Readiness

- [ ] **Verify TypeScript compilation** -- Run `npm run build` and confirm clean compilation with no errors. All `.d.ts` declaration files generated. | Status: not_done
- [ ] **Verify lint passes** -- Run `npm run lint` with no errors or warnings. | Status: not_done
- [ ] **Verify all tests pass** -- Run `npm run test` with all unit and integration tests passing. | Status: not_done
- [ ] **Verify package exports** -- Confirm that `main`, `types`, `files`, `bin`, and `exports` fields in `package.json` are correct. Verify that `npm pack` produces a correct tarball. | Status: not_done
- [ ] **Verify subpath exports work** -- Confirm `import { setupVCR } from 'llm-vcr/vitest'` resolves correctly. Same for jest and mocha. | Status: not_done
- [ ] **Verify CLI binary works** -- Run `npx llm-vcr list` and confirm it executes without error. | Status: not_done
