import { LLMProviderConfig } from '../../types/llm';
import { LLMCoreError } from './errors';
import { LLMProviderId, NormalizedLLMConfig, NormalizedProviderConfig } from './types';

const KNOWN_PROVIDERS: LLMProviderId[] = [
  'deepseek',
  'siliconflow',
  'openai',
  'anthropic',
  'cohere',
  'volc',
];

const CORE_IMPLEMENTED_PROVIDERS: LLMProviderId[] = ['deepseek', 'siliconflow'];

type LegacyRootConfig = Record<string, unknown> & {
  defaultProvider?: string;
};

type ProviderMapConfig = {
  defaultProvider?: string;
  providers?: Record<string, unknown>;
};

function asProviderId(provider: string | undefined): LLMProviderId | null {
  if (!provider) {
    return null;
  }

  const normalized = provider.toLowerCase() as LLMProviderId;
  return KNOWN_PROVIDERS.includes(normalized) ? normalized : null;
}

function fromLegacyProviderShape(
  provider: LLMProviderId,
  raw: unknown
): NormalizedProviderConfig | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const value = raw as Record<string, unknown>;

  if (typeof value.getApiKey === 'function') {
    return {
      provider,
      getApiKey: value.getApiKey as LLMProviderConfig['getApiKey'],
      model: typeof value.model === 'string' ? value.model : undefined,
      temperature:
        typeof value.temperature === 'number' ? value.temperature : undefined,
      maxTokens: typeof value.maxTokens === 'number' ? value.maxTokens : undefined,
    };
  }

  if (typeof value.apiKey === 'string') {
    return {
      provider,
      getApiKey: async () => value.apiKey as string,
      model: typeof value.model === 'string' ? value.model : undefined,
      temperature:
        typeof value.temperature === 'number' ? value.temperature : undefined,
      maxTokens: typeof value.maxTokens === 'number' ? value.maxTokens : undefined,
    };
  }

  return null;
}

export function normalizeLLMConfig(rawConfig: unknown): NormalizedLLMConfig {
  if (!rawConfig || typeof rawConfig !== 'object') {
    throw new LLMCoreError('LLM_CONFIG_MISSING', 'LLM config is not initialized');
  }

  const providers: Partial<Record<LLMProviderId, NormalizedProviderConfig>> = {};
  const root = rawConfig as LegacyRootConfig;
  const mapLike = rawConfig as ProviderMapConfig;

  if (mapLike.providers && typeof mapLike.providers === 'object') {
    for (const [providerName, providerRaw] of Object.entries(mapLike.providers)) {
      const provider = asProviderId(providerName);
      if (!provider) {
        continue;
      }
      const normalized = fromLegacyProviderShape(provider, providerRaw);
      if (normalized) {
        providers[provider] = normalized;
      }
    }
  }

  for (const providerName of KNOWN_PROVIDERS) {
    const normalized = fromLegacyProviderShape(providerName, root[providerName]);
    if (normalized) {
      providers[providerName] = normalized;
    }
  }

  const configuredProviders = Object.keys(providers) as LLMProviderId[];
  const configuredDefault = asProviderId(
    typeof root.defaultProvider === 'string' ? root.defaultProvider : undefined
  );
  const defaultProvider =
    configuredDefault ||
    configuredProviders[0] ||
    CORE_IMPLEMENTED_PROVIDERS[0];

  return {
    defaultProvider,
    providers,
  };
}

export function isProviderImplementedInCore(provider: string): boolean {
  const providerId = asProviderId(provider);
  return !!providerId && CORE_IMPLEMENTED_PROVIDERS.includes(providerId);
}

export function toProviderId(provider: string | undefined): LLMProviderId | null {
  return asProviderId(provider);
}

export function implementedProviders(): LLMProviderId[] {
  return [...CORE_IMPLEMENTED_PROVIDERS];
}

export function knownProviders(): LLMProviderId[] {
  return [...KNOWN_PROVIDERS];
}
