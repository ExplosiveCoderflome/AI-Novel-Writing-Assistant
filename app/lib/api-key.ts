/*
 * @LastEditors: biz
 */
export class APIKeyError extends Error {
  details?: unknown;
  
  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'APIKeyError';
    this.details = details;
  }
}

export async function getApiKey(provider: string): Promise<string> {
  // ... existing code ...
  if (!apiKey) {
    throw new APIKeyError(
      `未找到 ${provider} 的 API Key`,
      { provider, requiredEnvVar: envVar }
    );
  }
  return apiKey;
} 