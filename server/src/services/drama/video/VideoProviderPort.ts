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
