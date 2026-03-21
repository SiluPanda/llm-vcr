import type { Cassette, CassetteOptions, VCRConfig, VCRMode } from './types.js';
import { cassettePath, loadCassette } from './cassette.js';
import { installInterceptor, uninstallInterceptor } from './interceptor.js';

export async function withCassette<T>(
  name: string,
  fn: () => T | Promise<T>,
  options?: CassetteOptions & { config?: VCRConfig },
): Promise<T> {
  const config = options?.config ?? { cassettesDir: './cassettes' };
  const mode: VCRMode = options?.mode ?? config.mode ?? 'auto';

  const effectiveConfig: VCRConfig = { ...config, mode };

  const filePath = cassettePath(config.cassettesDir, name);

  const existingCassette = loadCassette(filePath);
  const cassette: Cassette = existingCassette ?? {
    version: 1,
    name,
    recordedAt: new Date().toISOString(),
    entries: [],
  };

  installInterceptor(name, cassette, filePath, effectiveConfig);

  try {
    const result = await fn();
    return result;
  } finally {
    uninstallInterceptor(name);
  }
}

export function createVCR(config: VCRConfig) {
  return {
    withCassette: <T>(
      name: string,
      fn: () => T | Promise<T>,
      options?: CassetteOptions,
    ) => withCassette(name, fn, { ...options, config }),
    config,
  };
}
