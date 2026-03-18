import type { World as PrismaWorld } from "@prisma/client";
import type { WorldLayerKey } from "@ai-novel/shared/types/world";
import {
  parseWorldGenerationBlueprint,
  type WorldGenerationBlueprint,
} from "@ai-novel/shared/types/worldWizard";

type WorldTextField =
  | "description"
  | "background"
  | "geography"
  | "cultures"
  | "magicSystem"
  | "politics"
  | "races"
  | "religions"
  | "technology"
  | "conflicts"
  | "history"
  | "economy"
  | "factions";

const WORLD_LAYER_LABELS: Record<WorldLayerKey, string> = {
  foundation: "基础层",
  power: "力量层",
  society: "社会层",
  culture: "文化层",
  history: "历史层",
  conflict: "冲突层",
};

const STORED_DIMENSION_LABELS: Record<string, string> = {
  foundation: "基础层",
  power: "力量层",
  society: "社会层",
  culture: "文化层",
  history: "历史层",
  conflict: "冲突层",
  geography: "地理环境",
  magicSystem: "力量体系",
  technology: "技术体系",
};

function parseStoredDimensionLabels(raw: string | null | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      return [];
    }

    return Object.entries(parsed)
      .filter(([, value]) => value === true)
      .map(([key]) => STORED_DIMENSION_LABELS[key] ?? key)
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function parseWorldBlueprintFromWorld(world: Pick<PrismaWorld, "selectedElements">): WorldGenerationBlueprint {
  return parseWorldGenerationBlueprint(world.selectedElements);
}

export function buildWorldBlueprintPromptBlock(
  world: Pick<PrismaWorld, "selectedDimensions" | "selectedElements">,
): string {
  const blueprint = parseWorldBlueprintFromWorld(world);
  const enabledDimensions = parseStoredDimensionLabels(world.selectedDimensions);

  const sections: string[] = [];

  if (enabledDimensions.length > 0) {
    sections.push(`用户勾选的生成维度：${enabledDimensions.join("、")}`);
  }

  if (blueprint.classicElements.length > 0) {
    sections.push(`用户保留的经典元素：${blueprint.classicElements.join("、")}`);
  }

  if (blueprint.propertySelections.length > 0) {
    const propertyLines = blueprint.propertySelections.map((selection) => {
      const detail = selection.detail?.trim() ? `；用户补充：${selection.detail.trim()}` : "";
      return `- [${WORLD_LAYER_LABELS[selection.targetLayer]}] ${selection.name}：${selection.description}${detail}`;
    });
    sections.push(`用户前置选定的世界属性：\n${propertyLines.join("\n")}`);
  }

  return sections.length > 0 ? sections.join("\n\n") : "无额外世界蓝图约束。";
}

export function applyGeneratedWorldFields<T extends Pick<PrismaWorld, WorldTextField>>(
  world: T,
  generated: Partial<Record<WorldTextField, string>>,
): T {
  return {
    ...world,
    ...generated,
  };
}
