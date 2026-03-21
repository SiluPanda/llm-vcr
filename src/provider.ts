const PROVIDERS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'openai', pattern: /api\.openai\.com\/v1\// },
  { name: 'azure-openai', pattern: /\.openai\.azure\.com\/openai\/deployments\// },
  { name: 'anthropic', pattern: /api\.anthropic\.com\/v1\// },
  { name: 'google', pattern: /generativelanguage\.googleapis\.com\// },
  { name: 'cohere', pattern: /api\.cohere\.(ai|com)\// },
  { name: 'mistral', pattern: /api\.mistral\.ai\// },
];

export function detectProvider(url: string): string {
  for (const provider of PROVIDERS) {
    if (provider.pattern.test(url)) {
      return provider.name;
    }
  }
  return 'unknown';
}

export function isLLMProvider(url: string): boolean {
  return PROVIDERS.some((p) => p.pattern.test(url));
}
