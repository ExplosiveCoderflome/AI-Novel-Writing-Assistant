import { prisma } from "../../../db/prisma";
import { novelEventBus } from "../../../events";
import type { NovelEvent } from "../../../events/types";

/**
 * 批次上下文稳定层缓存（Phase 2）
 *
 * 生命周期：进程内 singleton，按 novelId 分桶。
 * 失效策略：订阅 character:changed / world:updated / outline:revised / volume:updated 事件，
 *           对应 novelId 的稳定层立即失效。
 *
 * 缓存内容：novel + world + characters + storyMacroPlan + volumePlans
 * （这些字段在一次全书 autopilot pipeline 内基本不变，每章重查浪费巨大）
 */

// ────────────────────────────── 类型 ──────────────────────────────

/** novel Prisma 查询的完整返回类型 */
export type CachedNovelRow = NonNullable<Awaited<ReturnType<typeof fetchNovelRow>>>;

// ────────────────────────────── 内部缓存结构 ──────────────────────────────

interface StableLayerEntry {
  data: CachedNovelRow;
  cachedAt: number; // Date.now()
}

/** 最多缓存多少个 novelId（防内存泄漏） */
const MAX_CACHED_NOVELS = 8;
/** 稳定层 TTL（毫秒）：30 分钟 */
const STABLE_LAYER_TTL_MS = 30 * 60 * 1000;

class BatchContextCache {
  private readonly stableLayer = new Map<string, StableLayerEntry>();

  // ──────────────── 公共 API ────────────────

  /**
   * 获取 novelId 对应的稳定层数据。
   * cache miss 或 TTL 过期时重查 DB 并缓存。
   */
  async getNovelRow(novelId: string): Promise<CachedNovelRow> {
    const entry = this.stableLayer.get(novelId);
    if (entry && Date.now() - entry.cachedAt < STABLE_LAYER_TTL_MS) {
      return entry.data;
    }
    return this.fetchAndCache(novelId);
  }

  /**
   * 主动失效某 novelId 的稳定层（Agent 工具修改世界/角色后调用）。
   */
  invalidate(novelId: string): void {
    this.stableLayer.delete(novelId);
  }

  // ──────────────── 内部 ────────────────

  private async fetchAndCache(novelId: string): Promise<CachedNovelRow> {
    const row = await fetchNovelRow(novelId);
    if (!row) {
      throw new Error(`Novel not found: ${novelId}`);
    }
    // 超出最大容量时清掉最旧的条目
    if (this.stableLayer.size >= MAX_CACHED_NOVELS) {
      const oldestKey = [...this.stableLayer.entries()]
        .sort(([, a], [, b]) => a.cachedAt - b.cachedAt)[0]?.[0];
      if (oldestKey) {
        this.stableLayer.delete(oldestKey);
      }
    }
    this.stableLayer.set(novelId, { data: row, cachedAt: Date.now() });
    return row;
  }
}

// ────────────────────────────── singleton ──────────────────────────────

export const batchContextCache = new BatchContextCache();

// ────────────────────────────── 事件订阅（失效） ──────────────────────────────

// character 变更 → 失效该小说稳定层
novelEventBus.on(
  "character:changed",
  (event: Extract<NovelEvent, { type: "character:changed" }>) => {
    batchContextCache.invalidate(event.payload.novelId);
  },
);

// 卷更新（大纲/卷计划变更）→ 失效稳定层
novelEventBus.on(
  "volume:updated",
  (event: Extract<NovelEvent, { type: "volume:updated" }>) => {
    batchContextCache.invalidate(event.payload.novelId);
  },
);

// 大纲修订 → 失效稳定层
novelEventBus.on(
  "outline:revised",
  (event: Extract<NovelEvent, { type: "outline:revised" }>) => {
    batchContextCache.invalidate(event.payload.novelId);
  },
);

novelEventBus.on(
  "book-contract:updated",
  (event: Extract<NovelEvent, { type: "book-contract:updated" }>) => {
    batchContextCache.invalidate(event.payload.novelId);
  },
);

// pipeline 完成 → 失效（确保下次批次拿到最新状态）
novelEventBus.on(
  "pipeline:completed",
  (event: Extract<NovelEvent, { type: "pipeline:completed" }>) => {
    batchContextCache.invalidate(event.payload.novelId);
  },
);

// world:updated 只有 worldId，无法直接映射；
// 世界更新走 WorldContextGateway 自身缓存机制，BatchContextCache 不需要额外处理。

// ────────────────────────────── DB 查询 ──────────────────────────────

async function fetchNovelRow(novelId: string) {
  return prisma.novel.findUnique({
    where: { id: novelId },
    include: {
      world: true,
      genre: {
        select: { name: true },
      },
      characters: true,
      bookContract: true,
      storyMacroPlan: true,
      volumePlans: {
        orderBy: { sortOrder: "asc" },
        include: {
          sourceVersion: {
            select: { contentJson: true },
          },
          chapters: {
            orderBy: { chapterOrder: "asc" },
            select: { chapterOrder: true },
          },
        },
      },
      primaryStoryMode: {
        select: {
          id: true,
          name: true,
          description: true,
          template: true,
          parentId: true,
          profileJson: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      secondaryStoryMode: {
        select: {
          id: true,
          name: true,
          description: true,
          template: true,
          parentId: true,
          profileJson: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });
}
