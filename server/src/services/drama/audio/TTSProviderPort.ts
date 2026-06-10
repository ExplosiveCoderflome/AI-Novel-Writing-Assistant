export interface TTSGenerationRequest {
  text: string;
  voiceId?: string | null;
  speed?: number | null;
  emotion?: string | null;
}

export interface TTSGenerationResult {
  audioUrl: string;
  durationSec?: number;
  raw?: unknown;
}

export interface TTSProviderPort {
  readonly provider: string;
  readonly label?: string;
  readonly description?: string;
  synthesize(input: TTSGenerationRequest): Promise<TTSGenerationResult>;
}

const SILENT_WAV_DATA_URL = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

export class MockTTSProvider implements TTSProviderPort {
  readonly provider = "mock";
  readonly label = "模拟配音通道";
  readonly description = "用于联调短剧配音链路的本地模拟 provider，不会生成真实语音。";

  async synthesize(input: TTSGenerationRequest): Promise<TTSGenerationResult> {
    return {
      audioUrl: SILENT_WAV_DATA_URL,
      durationSec: Math.max(1, Math.ceil(input.text.length / 5)),
      raw: input,
    };
  }
}

function normalizeTimeoutMs(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 120000;
}

function readStringField(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function readNumberField(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return undefined;
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { rawText: text };
  }
}

export class HttpTTSProvider implements TTSProviderPort {
  readonly provider: string;
  readonly label: string;
  readonly description?: string;

  constructor(private readonly config: {
    provider: string;
    label?: string;
    description?: string;
    synthesizeUrl: string;
    apiKey?: string;
    timeoutMs?: number;
  }) {
    this.provider = config.provider;
    this.label = config.label ?? config.provider;
    this.description = config.description;
  }

  async synthesize(input: TTSGenerationRequest): Promise<TTSGenerationResult> {
    const response = await fetch(this.config.synthesizeUrl, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(normalizeTimeoutMs(this.config.timeoutMs)),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(`配音通道合成失败：${response.status} ${response.statusText}`);
    }
    const audioUrl = readStringField(payload, ["audioUrl", "url", "resultUrl"]);
    if (!audioUrl) {
      throw new Error("配音通道没有返回音频地址。");
    }
    return {
      audioUrl,
      durationSec: readNumberField(payload, ["durationSec", "duration", "seconds"]),
      raw: payload,
    };
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }
}

class TTSProviderRegistry {
  private readonly providers = new Map<string, TTSProviderPort>();

  register(provider: TTSProviderPort): void {
    this.providers.set(provider.provider, provider);
  }

  resolve(provider: string): TTSProviderPort {
    const resolved = this.providers.get(provider);
    if (!resolved) {
      throw new Error(`未注册的配音 provider：${provider}`);
    }
    return resolved;
  }

  listProviders(): Array<{ provider: string; label: string; description?: string }> {
    return [...this.providers.values()].map((provider) => ({
      provider: provider.provider,
      label: provider.label ?? provider.provider,
      description: provider.description,
    }));
  }
}

export const ttsProviderRegistry = new TTSProviderRegistry();
ttsProviderRegistry.register(new MockTTSProvider());

const httpSynthesizeUrl = process.env.DRAMA_TTS_HTTP_SYNTHESIZE_URL?.trim();
if (httpSynthesizeUrl) {
  ttsProviderRegistry.register(new HttpTTSProvider({
    provider: process.env.DRAMA_TTS_HTTP_PROVIDER_ID?.trim() || "http",
    label: process.env.DRAMA_TTS_HTTP_PROVIDER_LABEL?.trim() || "HTTP 配音通道",
    description: process.env.DRAMA_TTS_HTTP_PROVIDER_DESCRIPTION?.trim() || "通过环境变量配置的外部 TTS 服务。",
    synthesizeUrl: httpSynthesizeUrl,
    apiKey: process.env.DRAMA_TTS_HTTP_API_KEY?.trim() || undefined,
    timeoutMs: normalizeTimeoutMs(process.env.DRAMA_TTS_HTTP_TIMEOUT_MS),
  }));
}
