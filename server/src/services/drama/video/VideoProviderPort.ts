export interface VideoGenerationRequest {
  prompt: string;
  negativePrompt?: string | null;
  aspectRatio: string;
  durationSec?: number | null;
}

export interface VideoGenerationResult {
  providerTaskId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  resultUrl?: string;
  raw?: unknown;
}

export interface VideoProviderPort {
  readonly provider: string;
  readonly label?: string;
  readonly description?: string;
  createTask(input: VideoGenerationRequest): Promise<VideoGenerationResult>;
  getTask(providerTaskId: string): Promise<VideoGenerationResult>;
}

export class MockVideoProvider implements VideoProviderPort {
  readonly provider = "mock";
  readonly label = "模拟视频通道";
  readonly description = "用于联调视频生成链路的本地模拟 provider，不会生成真实视频。";

  async createTask(input: VideoGenerationRequest): Promise<VideoGenerationResult> {
    return {
      providerTaskId: `mock_${Date.now()}`,
      status: "queued",
      raw: input,
    };
  }

  async getTask(providerTaskId: string): Promise<VideoGenerationResult> {
    return {
      providerTaskId,
      status: "queued",
    };
  }
}

type VideoProviderStatus = VideoGenerationResult["status"];

function normalizeStatus(value: unknown): VideoProviderStatus {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["success", "succeeded", "completed", "complete", "done", "finished"].includes(raw)) {
    return "succeeded";
  }
  if (["fail", "failed", "error", "cancelled", "canceled"].includes(raw)) {
    return "failed";
  }
  if (["running", "processing", "generating", "in_progress"].includes(raw)) {
    return "running";
  }
  return "queued";
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

function normalizeTimeoutMs(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 120000;
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

export class HttpVideoProvider implements VideoProviderPort {
  readonly provider: string;
  readonly label: string;
  readonly description?: string;

  constructor(private readonly config: {
    provider: string;
    label?: string;
    description?: string;
    createUrl: string;
    statusUrl?: string;
    apiKey?: string;
    timeoutMs?: number;
  }) {
    this.provider = config.provider;
    this.label = config.label ?? config.provider;
    this.description = config.description;
  }

  async createTask(input: VideoGenerationRequest): Promise<VideoGenerationResult> {
    const payload = await this.postJson(this.config.createUrl, input);
    return {
      providerTaskId: readStringField(payload, ["providerTaskId", "taskId", "id", "requestId"]) ?? `http_${Date.now()}`,
      status: normalizeStatus(payload.status),
      resultUrl: readStringField(payload, ["resultUrl", "videoUrl", "url"]),
      raw: payload,
    };
  }

  async getTask(providerTaskId: string): Promise<VideoGenerationResult> {
    if (!this.config.statusUrl) {
      return {
        providerTaskId,
        status: "queued",
        raw: { message: "statusUrl is not configured" },
      };
    }
    const url = this.config.statusUrl.replace("{taskId}", encodeURIComponent(providerTaskId));
    const payload = await this.getJson(url);
    return {
      providerTaskId: readStringField(payload, ["providerTaskId", "taskId", "id", "requestId"]) ?? providerTaskId,
      status: normalizeStatus(payload.status),
      resultUrl: readStringField(payload, ["resultUrl", "videoUrl", "url"]),
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

  private async postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(normalizeTimeoutMs(this.config.timeoutMs)),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(`视频通道创建任务失败：${response.status} ${response.statusText}`);
    }
    return payload;
  }

  private async getJson(url: string): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
      method: "GET",
      headers: this.buildHeaders(),
      signal: AbortSignal.timeout(normalizeTimeoutMs(this.config.timeoutMs)),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(`视频通道查询任务失败：${response.status} ${response.statusText}`);
    }
    return payload;
  }
}

class VideoProviderRegistry {
  private readonly providers = new Map<string, VideoProviderPort>();

  register(provider: VideoProviderPort): void {
    this.providers.set(provider.provider, provider);
  }

  resolve(provider: string): VideoProviderPort {
    const resolved = this.providers.get(provider);
    if (!resolved) {
      throw new Error(`未注册的视频 provider：${provider}`);
    }
    return resolved;
  }

  listProviders(): Array<{
    provider: string;
    label: string;
    description?: string;
  }> {
    return [...this.providers.values()].map((provider) => ({
      provider: provider.provider,
      label: provider.label ?? provider.provider,
      description: provider.description,
    }));
  }
}

export const videoProviderRegistry = new VideoProviderRegistry();
videoProviderRegistry.register(new MockVideoProvider());

const httpCreateUrl = process.env.DRAMA_VIDEO_HTTP_CREATE_URL?.trim();
if (httpCreateUrl) {
  videoProviderRegistry.register(new HttpVideoProvider({
    provider: process.env.DRAMA_VIDEO_HTTP_PROVIDER_ID?.trim() || "http",
    label: process.env.DRAMA_VIDEO_HTTP_PROVIDER_LABEL?.trim() || "HTTP 视频通道",
    description: process.env.DRAMA_VIDEO_HTTP_PROVIDER_DESCRIPTION?.trim() || "通过环境变量配置的外部视频生成服务。",
    createUrl: httpCreateUrl,
    statusUrl: process.env.DRAMA_VIDEO_HTTP_STATUS_URL?.trim() || undefined,
    apiKey: process.env.DRAMA_VIDEO_HTTP_API_KEY?.trim() || undefined,
    timeoutMs: normalizeTimeoutMs(process.env.DRAMA_VIDEO_HTTP_TIMEOUT_MS),
  }));
}
