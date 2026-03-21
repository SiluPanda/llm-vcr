import type { RecordedRequest } from './types.js';

export class CassetteMismatchError extends Error {
  constructor(message: string, readonly request: RecordedRequest) {
    super(message);
    this.name = 'CassetteMismatchError';
  }
}

export class CassetteNotFoundError extends Error {
  constructor(readonly cassetteName: string, readonly filePath: string) {
    super(`Cassette not found: ${filePath}`);
    this.name = 'CassetteNotFoundError';
  }
}

export class CassetteCorruptError extends Error {
  constructor(readonly filePath: string, cause?: unknown) {
    super(`Cassette file is corrupt or invalid JSON: ${filePath}`);
    this.name = 'CassetteCorruptError';
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}
