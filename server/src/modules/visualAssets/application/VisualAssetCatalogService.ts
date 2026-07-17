import type {
  VisualAssetCatalogFacets,
  VisualAssetCatalogItem,
  VisualAssetCatalogPage,
  VisualAssetKind,
  VisualAssetScopeKind,
  VisualAssetScopeRef,
  VisualAssetSelection,
  VisualAssetSourceDomain,
} from "@ai-novel/shared/types/visualAsset";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { collectVisualAssetSources, type VisualAssetSourceItem } from "../adapters/visualAssetSources";

export interface ListVisualAssetsInput {
  scope?: VisualAssetScopeRef;
  allowedKinds?: VisualAssetKind[];
  kind?: VisualAssetKind;
  source?: VisualAssetSourceDomain;
  query?: string;
  cursor?: string;
  limit?: number;
}

interface Cursor {
  createdAt: string;
  id: string;
}

function toSelection(row: Awaited<ReturnType<typeof prisma.visualAssetProjection.findFirst>>): VisualAssetSelection {
  if (!row) throw new AppError("视觉素材不存在。", 404);
  return {
    assetId: row.id,
    url: row.url,
    thumbnailUrl: row.thumbnailUrl ?? row.url,
    kind: row.kind as VisualAssetKind,
    origin: row.origin as VisualAssetSelection["origin"],
    source: {
      domain: row.sourceDomain as VisualAssetSourceDomain,
      resourceType: row.sourceType,
      resourceId: row.sourceId,
      version: row.sourceVersion,
      label: row.sourceLabel,
    },
    scope: {
      kind: row.scopeKind as VisualAssetScopeKind,
      id: row.scopeId,
      label: row.scopeLabel,
    },
    mimeType: row.mimeType,
    width: row.width,
    height: row.height,
    prompt: row.prompt,
    provider: row.provider,
    model: row.model,
    createdAt: row.sourceCreatedAt.toISOString(),
  };
}

function toCatalogItem(row: Awaited<ReturnType<typeof prisma.visualAssetProjection.findFirst>>): VisualAssetCatalogItem {
  return { ...toSelection(row), isPrimary: row?.isPrimary ?? false };
}

function encodeCursor(row: { sourceCreatedAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ createdAt: row.sourceCreatedAt.toISOString(), id: row.id }), "utf8").toString("base64url");
}

function decodeCursor(value: string | undefined): Cursor | null {
  if (!value?.trim()) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<Cursor>;
    const date = typeof parsed.createdAt === "string" ? new Date(parsed.createdAt) : null;
    return date && !Number.isNaN(date.getTime()) && typeof parsed.id === "string" && parsed.id ? { createdAt: date.toISOString(), id: parsed.id } : null;
  } catch {
    throw new AppError("素材分页位置无效，请重新加载。", 400);
  }
}

function catalogWhere(input: Omit<ListVisualAssetsInput, "cursor" | "limit">, visibleSince?: Date) {
  const filters: Record<string, unknown>[] = [];
  if (visibleSince) filters.push({ lastSeenAt: { gte: visibleSince } });
  const kinds = input.kind ? [input.kind] : input.allowedKinds;
  if (kinds?.length) filters.push({ kind: { in: kinds } });
  if (input.source) filters.push({ sourceDomain: input.source });
  if (input.scope?.kind) filters.push({ scopeKind: input.scope.kind });
  if (input.scope?.id) filters.push({ scopeId: input.scope.id });
  const query = input.query?.trim();
  if (query) {
    filters.push({
      OR: [
        { sourceLabel: { contains: query } },
        { scopeLabel: { contains: query } },
        { prompt: { contains: query } },
      ],
    });
  }
  return filters.length ? { AND: filters } : {};
}

export class VisualAssetCatalogService {
  private refreshPromise: Promise<Date> | null = null;

  private async refresh(): Promise<Date> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.refreshInternal().finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }

  private async refreshInternal(): Promise<Date> {
    const items = await collectVisualAssetSources();
    const now = new Date();
    for (const item of items) {
      await this.upsertSourceItem(item, now);
    }
    return now;
  }

  private async upsertSourceItem(item: VisualAssetSourceItem, lastSeenAt: Date): Promise<void> {
    const data = {
      sourceLabel: item.sourceLabel,
      scopeKind: item.scopeKind,
      scopeId: item.scopeId,
      scopeLabel: item.scopeLabel,
      kind: item.kind,
      origin: item.origin,
      url: item.url,
      thumbnailUrl: item.thumbnailUrl,
      mimeType: item.mimeType,
      width: item.width,
      height: item.height,
      prompt: item.prompt,
      provider: item.provider,
      model: item.model,
      isPrimary: item.isPrimary,
      metadata: JSON.stringify(item.metadata),
      sourceCreatedAt: item.sourceCreatedAt,
      lastSeenAt,
    };
    await prisma.visualAssetProjection.upsert({
      where: {
        sourceDomain_sourceType_sourceId_sourceVersion: {
          sourceDomain: item.sourceDomain,
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          sourceVersion: item.sourceVersion,
        },
      },
      update: data,
      create: {
        sourceDomain: item.sourceDomain,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        sourceVersion: item.sourceVersion,
        ...data,
      },
    });
  }

  async list(input: ListVisualAssetsInput): Promise<VisualAssetCatalogPage> {
    const visibleSince = await this.refresh();
    const limit = Math.min(Math.max(input.limit ?? 30, 1), 60);
    const where = catalogWhere(input, visibleSince);
    const cursor = decodeCursor(input.cursor);
    const rows = await prisma.visualAssetProjection.findMany({
      where: cursor ? {
        ...where,
        AND: [
          ...((where as { AND?: Record<string, unknown>[] }).AND ?? []),
          {
            OR: [
              { sourceCreatedAt: { lt: new Date(cursor.createdAt) } },
              { sourceCreatedAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
            ],
          },
        ],
      } : where,
      orderBy: [{ sourceCreatedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const total = await prisma.visualAssetProjection.count({ where });
    const hasNext = rows.length > limit;
    const items = rows.slice(0, limit);
    return {
      items: items.map(toCatalogItem),
      nextCursor: hasNext && items.length ? encodeCursor(items[items.length - 1]) : null,
      total,
    };
  }

  async facets(input: Omit<ListVisualAssetsInput, "cursor" | "limit" | "kind" | "source">): Promise<VisualAssetCatalogFacets> {
    const visibleSince = await this.refresh();
    const rows = await prisma.visualAssetProjection.findMany({
      where: catalogWhere(input, visibleSince),
      select: { kind: true, sourceDomain: true, scopeKind: true, scopeId: true, scopeLabel: true },
    });
    const kindCounts = new Map<string, number>();
    const sourceCounts = new Map<string, number>();
    const scopeCounts = new Map<string, { kind: VisualAssetScopeKind; id: string | null; label: string | null; count: number }>();
    for (const row of rows) {
      kindCounts.set(row.kind, (kindCounts.get(row.kind) ?? 0) + 1);
      sourceCounts.set(row.sourceDomain, (sourceCounts.get(row.sourceDomain) ?? 0) + 1);
      const key = `${row.scopeKind}:${row.scopeId ?? ""}`;
      const scope = scopeCounts.get(key) ?? { kind: row.scopeKind as VisualAssetScopeKind, id: row.scopeId, label: row.scopeLabel, count: 0 };
      scope.count += 1;
      scopeCounts.set(key, scope);
    }
    return {
      kinds: Array.from(kindCounts, ([value, count]) => ({ value: value as VisualAssetKind, count })),
      sources: Array.from(sourceCounts, ([value, count]) => ({ value: value as VisualAssetSourceDomain, count })),
      scopes: Array.from(scopeCounts.values()),
    };
  }

  async get(assetId: string): Promise<VisualAssetSelection> {
    const visibleSince = await this.refresh();
    return toSelection(await prisma.visualAssetProjection.findFirst({
      where: { id: assetId, lastSeenAt: { gte: visibleSince } },
    }));
  }
}

export const visualAssetCatalogService = new VisualAssetCatalogService();
