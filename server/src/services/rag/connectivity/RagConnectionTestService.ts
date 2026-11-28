import type {
  EmbeddingConnectionTestInput,
  QdrantConnectionTestInput,
  RagConnectionTestResult,
} from "@ai-novel/shared/types/ragConnectivity";
import { getProviderEnvApiKey, providerRequiresApiKey, resolveProviderBaseUrl } from "../../../llm/providers";

interface ProviderConnection {
  key: string | null;
  baseURL: string | null;
  isActive: boolean;
}

export interface RagConnectionTestDependencies {
  getProvider: (provider: string) => Promise<ProviderConnection | null>;
  getQdrantConnection: () => Promise<{ url?: string; apiKey?: string }>;
  fetch: typeof fetch;
}

const defaults: RagConnectionTestDependencies = {
  async getProvider(provider) {
    const { prisma } = await import("../../../db/prisma");
    return prisma.aPIKey.findUnique({ where: { provider }, select: { key: true, baseURL: true, isActive: true } });
  },
  async getQdrantConnection() {
    const { prisma } = await import("../../../db/prisma");
    const settings = await prisma.appSetting.findMany({
      where: { key: { in: ["rag.qdrantUrl", "rag.qdrantApiKey"] } },
      select: { key: true, value: true },
    });
    const values = new Map(settings.map((setting) => [setting.key, setting.value.trim()]));
    return { url: values.get("rag.qdrantUrl"), apiKey: values.get("rag.qdrantApiKey") };
  },
  fetch: (...args) => fetch(...args),
};

function endpoint(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("invalid endpoint");
  }
  return url.href.replace(/\/+$/, "");
}

function sameOrigin(target: string, configured: string | undefined): boolean {
  if (!configured) return false;
  try {
    return new URL(endpoint(target)).origin === new URL(endpoint(configured)).origin;
  } catch {
    return false;
  }
}

function httpFailure(status: number): string {
  if (status === 401 || status === 403) return `服务拒绝访问（HTTP ${status}），请检查 API Key 和访问权限。`;
  if (status === 404) return "接口不存在（HTTP 404），请检查服务地址、模型名称和接口兼容性。";
  if (status === 429) return "请求受限（HTTP 429），请检查服务额度或稍后重试。";
  return `服务返回 HTTP ${status}，请检查服务状态和接口配置。`;
}

/** Draft probes read saved credentials only; they never save settings, index data or mutate ragConfig. */
export class RagConnectionTestService {
  constructor(private readonly deps: RagConnectionTestDependencies = defaults) {}

  private async run(timeoutMs: number, probe: (signal: AbortSignal) => Promise<Omit<RagConnectionTestResult, "durationMs">>): Promise<RagConnectionTestResult> {
    const started = performance.now();
    const signal = AbortSignal.timeout(Math.min(timeoutMs, 30_000));
    let result: Omit<RagConnectionTestResult, "durationMs">;
    try {
      result = await probe(signal);
    } catch {
      // Do not return upstream response bodies or exceptions: either may contain credentials.
      result = { ok: false, message: signal.aborted
        ? "连接测试超时，请检查网络和服务地址后重试（单次测试最多等待 30 秒）。"
        : "连接测试失败，请检查服务地址、网络及返回的数据格式。" };
    }
    return { ...result, durationMs: Math.round(performance.now() - started) };
  }

  testEmbedding(input: EmbeddingConnectionTestInput): Promise<RagConnectionTestResult> {
    return this.run(input.embeddingTimeoutMs, async (signal) => {
      const saved = await this.deps.getProvider(input.embeddingProvider);
      const savedBase = saved?.isActive ? saved.baseURL?.trim() : undefined;
      const configuredBase = resolveProviderBaseUrl(input.embeddingProvider, savedBase || undefined);
      const base = input.embeddingBaseURL?.trim() || configuredBase;
      if (!base) return { ok: false, message: "请填写向量服务 API 地址。" };
      // Draft endpoints must never receive credentials belonging to a different origin.
      const apiKey = input.embeddingApiKey?.trim() || (sameOrigin(base, configuredBase)
        ? (saved?.isActive ? saved.key?.trim() : undefined) || getProviderEnvApiKey(input.embeddingProvider)
        : undefined);
      if (!apiKey && providerRequiresApiKey(input.embeddingProvider)) {
        return { ok: false, message: "请为当前测试地址填写向量服务 API Key；已保存的密钥仅可在同源地址复用。" };
      }
      const response = await this.deps.fetch(`${endpoint(base)}/embeddings`, {
        method: "POST", signal, redirect: "error",
        headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
        body: JSON.stringify({ model: input.embeddingModel, input: ["connection test"] }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        return { ok: false, httpStatus: response.status, message: httpFailure(response.status) };
      }
      const payload = await response.json() as { data?: Array<{ embedding?: unknown }> };
      const vector = payload?.data?.length === 1 ? payload.data[0]?.embedding : undefined;
      if (!Array.isArray(vector) || !vector.length || !vector.every((value) => typeof value === "number" && Number.isFinite(value))) {
        return { ok: false, message: "服务未返回有效向量，请检查所选模型是否支持 Embedding 接口。" };
      }
      return { ok: true, dimensions: vector.length, message: `向量模型连接成功，已生成 ${vector.length} 维测试向量。` };
    });
  }

  testQdrant(input: QdrantConnectionTestInput): Promise<RagConnectionTestResult> {
    return this.run(input.qdrantTimeoutMs, async (signal) => {
      const base = endpoint(input.qdrantUrl);
      let apiKey = input.clearQdrantApiKey ? undefined : input.qdrantApiKey?.trim();
      if (!input.clearQdrantApiKey && !apiKey) {
        const saved = await this.deps.getQdrantConnection();
        const configuredBase = saved.url?.trim() || process.env.QDRANT_URL?.trim() || "http://127.0.0.1:6333";
        if (sameOrigin(base, configuredBase)) {
          apiKey = saved.apiKey?.trim() || process.env.QDRANT_API_KEY?.trim();
        }
      }
      const headers = apiKey ? { "api-key": apiKey } : undefined;
      for (const route of ["/readyz", "/collections"]) {
        const response = await this.deps.fetch(base + route, { headers, signal, redirect: "error" });
        if (!response.ok) {
          await response.body?.cancel();
          return { ok: false, httpStatus: response.status, message: httpFailure(response.status) };
        }
        if (route === "/collections") {
          const data = await response.json() as { result?: { collections?: unknown } };
          if (!Array.isArray(data?.result?.collections)) return { ok: false, message: "服务未返回 Qdrant 集合列表，请检查向量数据库地址。" };
        } else {
          await response.body?.cancel();
        }
      }
      return { ok: true, message: "向量数据库连接成功，可读取集合列表；未测试写入权限。" };
    });
  }
}
