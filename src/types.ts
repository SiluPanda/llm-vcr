export type VCRMode = 'record' | 'replay' | 'auto' | 'passthrough';

export interface VCRConfig {
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

export interface CassetteEntry {
  request: RecordedRequest;
  response: RecordedResponse;
  metadata: EntryMetadata;
}

export interface RecordedRequest {
  provider: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface RecordedResponse {
  status: number;
  headers: Record<string, string>;
  body?: unknown;
  streaming?: boolean;
  chunks?: Array<{ data: string; timestamp: number }>;
}

export interface EntryMetadata {
  recordedAt: string;
  durationMs: number;
  requestHash: string;
}

export interface Cassette {
  version: number;
  name: string;
  recordedAt: string;
  entries: CassetteEntry[];
}

export interface CassetteOptions {
  mode?: VCRMode;
}
