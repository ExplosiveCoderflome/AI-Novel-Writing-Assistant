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

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
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

    const getResponse = await fetch(toCollectionUrl(""), { headers: buildHeaders() });
    if (getResponse.status === 404) {
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
    this.ensuredDimension = dimension;
  }

  async upsertPoints(points: QdrantPoint[]): Promise<void> {
    if (points.length === 0) {
      return;
    }
    const batches = this.splitPointBatches(points);
    for (const batch of batches) {
      await this.upsertPointBatch(batch);
    }
  }

  async deletePoints(pointIds: string[]): Promise<void> {
    if (pointIds.length === 0) {
      return;
    }
    await this.request(toCollectionUrl("/points/delete?wait=true"), {
      method: "POST",
      body: JSON.stringify({
        points: pointIds,
      }),
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
      const response = await fetch(`${ragConfig.qdrantUrl}/healthz`, {
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
