import { ragConfig } from "../../config/rag";
import type { RagOwnerType } from "./types";

interface QdrantPayload {
  tenantId: string;
  ownerType: RagOwnerType;
  ownerId: string;
  novelId?: string;
  worldId?: string;
  title?: string;
  chunkText: string;
  chunkHash: string;
  chunkOrder: number;
  metadataJson?: string;
}

interface QdrantPoint {
  id: string;
  vector: number[];
  payload: QdrantPayload;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  payload: QdrantPayload;
}

interface VectorSearchFilter {
  tenantId: string;
  novelId?: string;
  worldId?: string;
  ownerTypes?: RagOwnerType[];
  ownerIds?: string[];
}

function buildHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(ragConfig.qdrantApiKey ? { "api-key": ragConfig.qdrantApiKey } : {}),
  };
}

function toCollectionUrl(suffix: string): string {
  return `${ragConfig.qdrantUrl}/collections/${ragConfig.qdrantCollection}${suffix}`;
}

function estimateJsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export class VectorStoreService {
  private ensuredDimension = 0;
  private readonly upsertWrapperBytes = estimateJsonBytes({ points: [] });
  private static readonly timeoutPattern = /Qdrant 请求超时/;
  private static readonly logPrefix = "[RAG][Qdrant]";

  private logInfo(message: string, meta?: Record<string, unknown>): void {
    if (!ragConfig.verboseLog) {
      return;
    }
    if (meta) {
      console.info(`${VectorStoreService.logPrefix} ${message}`, meta);
      return;
    }
    console.info(`${VectorStoreService.logPrefix} ${message}`);
  }

  private logWarn(message: string, meta?: Record<string, unknown>): void {
    if (!ragConfig.verboseLog) {
      return;
    }
    if (meta) {
      console.warn(`${VectorStoreService.logPrefix} ${message}`, meta);
      return;
    }
    console.warn(`${VectorStoreService.logPrefix} ${message}`);
  }

  private async fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ragConfig.qdrantTimeoutMs);
    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Qdrant 请求超时（>${ragConfig.qdrantTimeoutMs}ms）。`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchWithTimeout(url, {
      ...init,
      headers: {
        ...buildHeaders(),
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Qdrant 请求失败(${response.status})：${text}`);
    }
    return await response.json() as T;
  }

  private async upsertPointBatch(points: QdrantPoint[]): Promise<void> {
    await this.request(toCollectionUrl("/points?wait=true"), {
      method: "PUT",
      body: JSON.stringify({ points }),
    });
  }

  private async upsertPointBatchAdaptive(
    points: QdrantPoint[],
    context: { batchIndex: number; totalBatches: number; depth: number },
  ): Promise<void> {
    const startedAt = Date.now();
    const batchBytes = estimateJsonBytes({ points });
    try {
      await this.upsertPointBatch(points);
      this.logInfo("Upsert batch succeeded.", {
        batch: `${context.batchIndex}/${context.totalBatches}`,
        depth: context.depth,
        points: points.length,
        bytes: batchBytes,
        elapsedMs: Date.now() - startedAt,
      });
      return;
    } catch (error) {
      const isTimeout = error instanceof Error && VectorStoreService.timeoutPattern.test(error.message);
      if (!isTimeout || points.length <= 1) {
        this.logWarn("Upsert batch failed.", {
          batch: `${context.batchIndex}/${context.totalBatches}`,
          depth: context.depth,
          points: points.length,
          bytes: batchBytes,
          elapsedMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      this.logWarn("Upsert batch timed out; split and retry.", {
        batch: `${context.batchIndex}/${context.totalBatches}`,
        depth: context.depth,
        points: points.length,
        bytes: batchBytes,
      });
    }

    const splitAt = Math.ceil(points.length / 2);
    await this.upsertPointBatchAdaptive(points.slice(0, splitAt), {
      ...context,
      depth: context.depth + 1,
    });
    await this.upsertPointBatchAdaptive(points.slice(splitAt), {
      ...context,
      depth: context.depth + 1,
    });
  }

  private splitPointBatches(points: QdrantPoint[]): QdrantPoint[][] {
    const maxBytes = ragConfig.qdrantUpsertMaxBytes;
    const batches: QdrantPoint[][] = [];
    let currentBatch: QdrantPoint[] = [];
    let currentBytes = this.upsertWrapperBytes;

    for (const point of points) {
      const pointBytes = estimateJsonBytes(point);
      const singlePointBytes = this.upsertWrapperBytes + pointBytes;
      if (singlePointBytes > maxBytes) {
        throw new Error(
          `Qdrant single point payload is too large: point=${point.id}, bytes=${singlePointBytes}, limit=${maxBytes}`,
        );
      }

      const separatorBytes = currentBatch.length > 0 ? 1 : 0;
      if (currentBatch.length > 0 && currentBytes + separatorBytes + pointBytes > maxBytes) {
        batches.push(currentBatch);
        currentBatch = [point];
        currentBytes = this.upsertWrapperBytes + pointBytes;
        continue;
      }

      currentBatch.push(point);
      currentBytes += separatorBytes + pointBytes;
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  async ensureCollection(dimension: number): Promise<void> {
    if (dimension <= 0) {
      throw new Error("向量维度无效。");
    }
    if (this.ensuredDimension === dimension) {
      return;
    }

    const getResponse = await this.fetchWithTimeout(toCollectionUrl(""), { headers: buildHeaders() });
    if (getResponse.status === 404) {
      this.logInfo("Collection not found; creating collection.", {
        collection: ragConfig.qdrantCollection,
        dimension,
      });
      await this.request(toCollectionUrl(""), {
        method: "PUT",
        body: JSON.stringify({
          vectors: {
            size: dimension,
            distance: "Cosine",
          },
        }),
      });
      this.ensuredDimension = dimension;
      return;
    }
    if (!getResponse.ok) {
      const text = await getResponse.text();
      throw new Error(`Qdrant 集合检查失败(${getResponse.status})：${text}`);
    }
    const payload = await getResponse.json() as {
      result?: {
        config?: {
          params?: {
            vectors?: { size?: number };
          };
        };
      };
    };
    const existingDimension = payload.result?.config?.params?.vectors?.size;
    if (existingDimension && existingDimension !== dimension) {
      throw new Error(`Qdrant 集合维度不匹配：existing=${existingDimension}, expected=${dimension}`);
    }
    this.logInfo("Collection ready.", {
      collection: ragConfig.qdrantCollection,
      expectedDimension: dimension,
      existingDimension: existingDimension ?? dimension,
    });
    this.ensuredDimension = dimension;
  }

  async upsertPoints(points: QdrantPoint[]): Promise<void> {
    if (points.length === 0) {
      return;
    }
    const startedAt = Date.now();
    const batches = this.splitPointBatches(points);
    this.logInfo("Upsert points start.", {
      totalPoints: points.length,
      batches: batches.length,
      timeoutMs: ragConfig.qdrantTimeoutMs,
      upsertMaxBytes: ragConfig.qdrantUpsertMaxBytes,
    });
    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      await this.upsertPointBatchAdaptive(batch, {
        batchIndex: index + 1,
        totalBatches: batches.length,
        depth: 0,
      });
    }
    this.logInfo("Upsert points finished.", {
      totalPoints: points.length,
      batches: batches.length,
      elapsedMs: Date.now() - startedAt,
    });
  }

  async deletePoints(pointIds: string[]): Promise<void> {
    if (pointIds.length === 0) {
      return;
    }
    const startedAt = Date.now();
    await this.request(toCollectionUrl("/points/delete?wait=true"), {
      method: "POST",
      body: JSON.stringify({
        points: pointIds,
      }),
    });
    this.logInfo("Delete points finished.", {
      points: pointIds.length,
      elapsedMs: Date.now() - startedAt,
    });
  }

  async search(vector: number[], limit: number, filter: VectorSearchFilter): Promise<VectorSearchResult[]> {
    if (vector.length === 0 || limit <= 0) {
      return [];
    }
    const must: Array<Record<string, unknown>> = [
      {
        key: "tenantId",
        match: { value: filter.tenantId },
      },
    ];
    if (filter.novelId) {
      must.push({
        key: "novelId",
        match: { value: filter.novelId },
      });
    }
    if (filter.worldId) {
      must.push({
        key: "worldId",
        match: { value: filter.worldId },
      });
    }
    if (filter.ownerTypes && filter.ownerTypes.length > 0) {
      must.push({
        key: "ownerType",
        match: { any: filter.ownerTypes },
      });
    }
    if (filter.ownerIds && filter.ownerIds.length > 0) {
      must.push({
        key: "ownerId",
        match: { any: filter.ownerIds },
      });
    }

    const response = await this.request<{
      result?: Array<{ id: string; score: number; payload?: QdrantPayload }>;
    }>(toCollectionUrl("/points/search"), {
      method: "POST",
      body: JSON.stringify({
        vector,
        limit,
        with_payload: true,
        filter: {
          must,
        },
      }),
    });
    return (response.result ?? [])
      .filter((item) => item.payload)
      .map((item) => ({
        id: String(item.id),
        score: item.score,
        payload: item.payload as QdrantPayload,
      }));
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    try {
      const response = await this.fetchWithTimeout(`${ragConfig.qdrantUrl}/healthz`, {
        headers: buildHeaders(),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Qdrant health check failed(${response.status})：${text}`);
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : "qdrant health check failed" };
    }
  }
}
