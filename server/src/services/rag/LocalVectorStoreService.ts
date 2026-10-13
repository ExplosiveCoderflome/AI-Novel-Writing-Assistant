// =============================================================================
// LocalVectorStoreService — 本地向量库（fork 新增，安卓端可用）
//
// 用 SQLite（better-sqlite3）+ 暴力余弦相似度替代 Qdrant，接口与
// VectorStoreService 的 5 个公开方法保持一致（ensureCollection / upsertPoints /
// deletePoints / search / healthCheck），HybridRetrievalService 与 RagIndexService
// 无需感知驱动差异。关键词检索一路本来走 prisma.knowledgeChunk（SQLite），
// 不经过向量库，因此本文件补齐后 RAG 可完全脱离 Qdrant 运行。
//
// 定位：个人知识库量级（几千~几万 chunk × 1024 维）下暴力余弦在毫秒~百毫秒
// 级，无需 ANN 索引。向量存 BLOB（Float32Array），库文件默认与运行数据同目录：
//   ${AI_NOVEL_APP_DATA_DIR:-cwd}/rag_local_vectors.db
//
// 切换方式：环境变量 RAG_VECTOR_STORE=local（默认 qdrant，与上游保持一致）。
// 注意：更换 embedding 模型（维度变化）后，需删除该 db 文件重建索引。
// =============================================================================
import path from "node:path";
import Database from "better-sqlite3";
import { ragConfig } from "../../config/rag";
import type { RagOwnerType } from "./types";
import type { RagChunkFacets } from "./chunkFacets";
import type { VectorStore } from "./VectorStoreService";

interface LocalVectorPayload {
  tenantId: string;
  ownerType: RagOwnerType;
  ownerId: string;
  novelId?: string;
  worldId?: string;
  title?: string;
  chunkText: string;
  contextPrefix?: string;
  contextVersion?: number;
  contextSourceHash?: string;
  searchText?: string;
  chunkHash: string;
  chunkOrder: number;
  metadataJson?: string;
  facetKeys?: string | null;
  chapterAnchor?: string | string[] | null;
  genreTags?: string[];
  sellingPointTags?: string[];
  targetReaders?: string[];
  strengths?: string[];
  weaknesses?: string[];
  characterRole?: string[];
}

interface LocalVectorPoint {
  id: string;
  vector: number[];
  payload: LocalVectorPayload;
}

interface LocalVectorSearchFilter {
  tenantId: string;
  novelId?: string;
  worldId?: string;
  ownerTypes?: RagOwnerType[];
  ownerIds?: string[];
  facets?: RagChunkFacets;
}

export interface LocalVectorSearchResult {
  id: string;
  score: number;
  payload: LocalVectorPayload;
}

function resolveDbPath(): string {
  const baseDir = process.env.AI_NOVEL_APP_DATA_DIR?.trim() || process.cwd();
  return path.join(baseDir, "rag_local_vectors.db");
}

function matchFacets(payload: LocalVectorPayload, facets?: RagChunkFacets): boolean {
  if (!facets) {
    return true;
  }
  const record = payload as unknown as Record<string, unknown>;
  for (const [key, values] of Object.entries(facets)) {
    const wanted = Array.from(
      new Set((values ?? []).map((item) => String(item).trim()).filter(Boolean)),
    );
    if (wanted.length === 0) {
      continue;
    }
    const raw = record[key];
    const have: string[] = Array.isArray(raw)
      ? raw.map((item) => String(item))
      : typeof raw === "string" && raw
        ? [raw]
        : [];
    if (!wanted.some((value) => have.includes(value))) {
      return false;
    }
  }
  return true;
}

export class LocalVectorStoreService implements VectorStore {
  private db: Database.Database | null = null;
  private ensuredDimension = 0;
  private readonly logPrefix = "[RAG][LocalStore]";

  private logInfo(message: string, meta?: Record<string, unknown>): void {
    if (!ragConfig.verboseLog) {
      return;
    }
    if (meta) {
      console.info(`${this.logPrefix} ${message}`, meta);
      return;
    }
    console.info(`${this.logPrefix} ${message}`);
  }

  private ensureDb(): Database.Database {
    if (this.db) {
      return this.db;
    }
    const db = new Database(resolveDbPath());
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS rag_local_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rag_local_vectors (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        novel_id TEXT,
        world_id TEXT,
        owner_type TEXT,
        owner_id TEXT,
        payload_json TEXT NOT NULL,
        norm REAL NOT NULL,
        vec BLOB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_rag_local_vectors_scope
        ON rag_local_vectors(tenant_id, novel_id, world_id);
    `);
    this.db = db;
    return db;
  }

  async ensureCollection(dimension: number): Promise<void> {
    if (!Number.isInteger(dimension) || dimension <= 0) {
      throw new Error(`本地向量库收到非法维度：${dimension}`);
    }
    const db = this.ensureDb();
    const currentKey = [
      ragConfig.embeddingProvider,
      ragConfig.embeddingModel,
      `v${ragConfig.embeddingVersion}`,
    ].join("|");
    const dimRow = db.prepare("SELECT value FROM rag_local_meta WHERE key = 'dimension'").get() as
      | { value: string }
      | undefined;
    const keyRow = db.prepare("SELECT value FROM rag_local_meta WHERE key = 'embedding_key'").get() as
      | { value: string }
      | undefined;
    const storedDim = dimRow ? Number(dimRow.value) : undefined;
    const storedKey = keyRow?.value;

    if (storedDim !== undefined && (storedDim !== dimension || (storedKey && storedKey !== currentKey))) {
      // 换 embedding 模型/维度后旧向量不可用（不同模型的向量空间互不兼容）。
      // 源数据块仍在 SQLite（knowledgeChunk），向量属可再生数据：自动清空重来，
      // 免去手机端手动删除文件的麻烦；清空后需在知识库重新索引。
      const count = (db.prepare("SELECT COUNT(*) AS c FROM rag_local_vectors").get() as { c: number }).c;
      db.exec("DELETE FROM rag_local_vectors");
      console.warn(
        `${this.logPrefix} embedding 配置变更（维度 ${storedDim}→${dimension}，模型 ${storedKey ?? "?"}→${currentKey}），已清空本地向量（${count} 条）。请在知识库重新索引以恢复检索。`,
      );
    }

    db.prepare(
      `INSERT INTO rag_local_meta (key, value) VALUES ('dimension', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(String(dimension));
    db.prepare(
      `INSERT INTO rag_local_meta (key, value) VALUES ('embedding_key', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(currentKey);
    this.ensuredDimension = dimension;
  }

  async upsertPoints(points: LocalVectorPoint[]): Promise<void> {
    if (points.length === 0) {
      return;
    }
    const db = this.ensureDb();
    const stmt = db.prepare(`
      INSERT INTO rag_local_vectors
        (id, tenant_id, novel_id, world_id, owner_type, owner_id, payload_json, norm, vec)
      VALUES
        (@id, @tenantId, @novelId, @worldId, @ownerType, @ownerId, @payloadJson, @norm, @vec)
      ON CONFLICT(id) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        novel_id = excluded.novel_id,
        world_id = excluded.world_id,
        owner_type = excluded.owner_type,
        owner_id = excluded.owner_id,
        payload_json = excluded.payload_json,
        norm = excluded.norm,
        vec = excluded.vec
    `);
    const runBatch = db.transaction((batch: LocalVectorPoint[]) => {
      for (const point of batch) {
        const vector = Float32Array.from(point.vector);
        let norm = 0;
        for (const value of vector) {
          norm += value * value;
        }
        norm = Math.sqrt(norm);
        stmt.run({
          id: point.id,
          tenantId: point.payload.tenantId,
          novelId: point.payload.novelId ?? null,
          worldId: point.payload.worldId ?? null,
          ownerType: point.payload.ownerType ?? null,
          ownerId: point.payload.ownerId ?? null,
          payloadJson: JSON.stringify(point.payload),
          norm,
          vec: Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength),
        });
      }
    });
    runBatch(points);
    this.logInfo(`Upsert ${points.length} points.`, { totalPoints: points.length });
  }

  async deletePoints(pointIds: string[]): Promise<void> {
    if (pointIds.length === 0) {
      return;
    }
    const db = this.ensureDb();
    const stmt = db.prepare("DELETE FROM rag_local_vectors WHERE id = ?");
    db.transaction((ids: string[]) => {
      for (const id of ids) {
        stmt.run(id);
      }
    })(pointIds);
    this.logInfo(`Delete ${pointIds.length} points.`, { totalIds: pointIds.length });
  }

  async search(vector: number[], limit: number, filter: LocalVectorSearchFilter): Promise<LocalVectorSearchResult[]> {
    if (vector.length === 0 || limit <= 0) {
      return [];
    }
    const db = this.ensureDb();
    const conditions = ["tenant_id = ?"];
    const params: string[] = [filter.tenantId];
    if (filter.novelId) {
      conditions.push("novel_id = ?");
      params.push(filter.novelId);
    }
    if (filter.worldId) {
      conditions.push("world_id = ?");
      params.push(filter.worldId);
    }
    const rows = db
      .prepare(`SELECT id, payload_json, norm, vec FROM rag_local_vectors WHERE ${conditions.join(" AND ")}`)
      .all(...params) as Array<{ id: string; payload_json: string; norm: number; vec: Buffer }>;

    const query = Float32Array.from(vector);
    let queryNorm = 0;
    for (const value of query) {
      queryNorm += value * value;
    }
    queryNorm = Math.sqrt(queryNorm);
    if (queryNorm === 0) {
      return [];
    }

    const scored: LocalVectorSearchResult[] = [];
    for (const row of rows) {
      let payload: LocalVectorPayload;
      try {
        payload = JSON.parse(row.payload_json) as LocalVectorPayload;
      } catch {
        continue;
      }
      if (filter.ownerTypes && filter.ownerTypes.length > 0 && !filter.ownerTypes.includes(payload.ownerType)) {
        continue;
      }
      if (filter.ownerIds && filter.ownerIds.length > 0 && !filter.ownerIds.includes(payload.ownerId)) {
        continue;
      }
      if (!matchFacets(payload, filter.facets)) {
        continue;
      }
      if (row.vec.byteLength !== query.length * 4) {
        // 维度不一致的历史行（换模型残留），跳过而不是报错
        continue;
      }
      const stored = new Float32Array(row.vec.buffer, row.vec.byteOffset, row.vec.byteLength / 4);
      let dot = 0;
      for (let i = 0; i < stored.length; i += 1) {
        dot += stored[i] * query[i];
      }
      const denominator = row.norm * queryNorm;
      const score = denominator === 0 ? 0 : dot / denominator;
      scored.push({ id: row.id, score, payload });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    try {
      const db = this.ensureDb();
      const count = (db.prepare("SELECT COUNT(*) AS c FROM rag_local_vectors").get() as { c: number }).c;
      const dimensionRow = db.prepare("SELECT value FROM rag_local_meta WHERE key = 'dimension'").get() as
        | { value: string }
        | undefined;
      return {
        ok: true,
        detail: `local vector store（${count} points，dimension=${dimensionRow?.value ?? "未初始化"}，${resolveDbPath()}）`,
      };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : "local vector store failed" };
    }
  }
}
