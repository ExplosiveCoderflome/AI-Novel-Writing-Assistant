import type { NovelWorldAssetSummary, WorldAssetType } from "@ai-novel/shared/types/novelWorld";

export interface WorldAssetRow {
  id: string;
  assetType: WorldAssetType;
  title: string;
  description: string | null;
  status: string;
  thumbnailUrl: string | null;
  version: number;
  renderDataJson: string | null;
  updatedAt: Date | string;
}

const WORLD_ASSET_BLUEPRINTS: Array<{
  assetType: WorldAssetType;
  title: string;
  description: string;
}> = [
  {
    assetType: "map",
    title: "世界地图",
    description: "整理区域、路线、势力控制区和故事发生地。",
  },
  {
    assetType: "faction_diagram",
    title: "势力图谱",
    description: "呈现联盟、敌对、附庸和竞争关系。",
  },
  {
    assetType: "timeline",
    title: "世界时间线",
    description: "承载历史事件、当前局势和后续变化。",
  },
  {
    assetType: "character_network",
    title: "角色关系网",
    description: "连接角色、阵营归属、立场变化和关系张力。",
  },
  {
    assetType: "power_system_tree",
    title: "力量体系树",
    description: "沉淀等级、资源、代价和禁忌边界。",
  },
];

export function serializeNovelWorldAssetRows(rows: WorldAssetRow[]): NovelWorldAssetSummary[] {
  const rowByType = new Map<WorldAssetType, WorldAssetRow>();
  for (const row of rows) {
    const existing = rowByType.get(row.assetType);
    if (!existing || compareAssetFreshness(row, existing) > 0) {
      rowByType.set(row.assetType, row);
    }
  }
  return WORLD_ASSET_BLUEPRINTS.map((blueprint) => {
    const row = rowByType.get(blueprint.assetType);
    return {
      id: row?.id ?? null,
      assetType: blueprint.assetType,
      title: row?.title ?? blueprint.title,
      description: row?.description ?? blueprint.description,
      status: row?.status ?? "placeholder",
      thumbnailUrl: row?.thumbnailUrl ?? null,
      version: row?.version ?? null,
      updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      hasRenderData: Boolean(row?.renderDataJson?.trim()),
    };
  });
}

function compareAssetFreshness(left: WorldAssetRow, right: WorldAssetRow): number {
  const leftTime = new Date(left.updatedAt).getTime();
  const rightTime = new Date(right.updatedAt).getTime();
  const normalizedLeftTime = Number.isFinite(leftTime) ? leftTime : 0;
  const normalizedRightTime = Number.isFinite(rightTime) ? rightTime : 0;
  if (normalizedLeftTime !== normalizedRightTime) {
    return normalizedLeftTime - normalizedRightTime;
  }
  return left.version - right.version;
}
