// llm-vcr - Record and replay LLM API calls for deterministic testing

export { withCassette, createVCR } from './vcr.js';

export type {
  VCRMode,
  VCRConfig,
  CassetteEntry,
  RecordedRequest,
  RecordedResponse,
  EntryMetadata,
  Cassette,
  CassetteOptions,
} from './types.js';

export { CassetteMismatchError, CassetteNotFoundError, CassetteCorruptError } from './errors.js';

export { detectProvider, isLLMProvider } from './provider.js';

export { hashRequest, normalizeMessages } from './hash.js';

export { cassettePath, loadCassette, saveCassette } from './cassette.js';

export { scrubHeaders, scrubBody } from './scrub.js';

export { matchRequest, scoreRequest } from './matcher.js';
