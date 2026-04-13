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

const WORLD_REFERENCE_MODE_LABELS = {
  extract_base: "提取原作世界基底",
  adapt_world: "基于原作做架空改造",
  tone_rebuild: "只借原作气质与结构重建",
} as const;

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
      const choice = selection.choiceLabel?.trim()
        ? `；选择方向：${selection.choiceLabel.trim()}${selection.choiceSummary?.trim() ? `（${selection.choiceSummary.trim()}）` : ""}`
        : "";
      const detail = selection.detail?.trim() ? `；用户补充：${selection.detail.trim()}` : "";
      return `- [${WORLD_LAYER_LABELS[selection.targetLayer]}] ${selection.name}：${selection.description}${choice}${detail}`;
    });
    sections.push(`用户前置选定的世界属性：\n${propertyLines.join("\n")}`);
  }

  if (blueprint.referenceContext) {
    sections.push(`参考作品处理方式：${WORLD_REFERENCE_MODE_LABELS[blueprint.referenceContext.mode]}`);

    if (blueprint.referenceContext.anchors.length > 0) {
      sections.push(
        `参考作品世界锚点：\n${blueprint.referenceContext.anchors.map((item) => `- ${item.label}：${item.content}`).join("\n")}`,
      );
    }

    if (blueprint.referenceContext.preserveElements.length > 0) {
      sections.push(`必须保留：${blueprint.referenceContext.preserveElements.join("、")}`);
    }

    if (blueprint.referenceContext.allowedChanges.length > 0) {
      sections.push(`允许改造：${blueprint.referenceContext.allowedChanges.join("、")}`);
    }

    if (blueprint.referenceContext.forbiddenElements.length > 0) {
      sections.push(`禁止偏离：${blueprint.referenceContext.forbiddenElements.join("、")}`);
    }

    const selectedRuleNames = (blueprint.referenceContext.referenceSeeds?.rules ?? [])
      .filter((item) => blueprint.referenceContext?.selectedSeedIds?.ruleIds.includes(item.id))
      .map((item) => item.name);
    if (selectedRuleNames.length > 0) {
      sections.push(`直接沿用的原作规则：${selectedRuleNames.join("、")}`);
    }

    const selectedFactionNames = (blueprint.referenceContext.referenceSeeds?.factions ?? [])
      .filter((item) => blueprint.referenceContext?.selectedSeedIds?.factionIds.includes(item.id))
      .map((item) => item.name);
    if (selectedFactionNames.length > 0) {
      sections.push(`直接沿用的原作阵营：${selectedFactionNames.join("、")}`);
    }

    const selectedForceNames = (blueprint.referenceContext.referenceSeeds?.forces ?? [])
      .filter((item) => blueprint.referenceContext?.selectedSeedIds?.forceIds.includes(item.id))
      .map((item) => item.name);
    if (selectedForceNames.length > 0) {
      sections.push(`直接沿用的原作势力：${selectedForceNames.join("、")}`);
    }

    const selectedLocationNames = (blueprint.referenceContext.referenceSeeds?.locations ?? [])
      .filter((item) => blueprint.referenceContext?.selectedSeedIds?.locationIds.includes(item.id))
      .map((item) => item.name);
    if (selectedLocationNames.length > 0) {
      sections.push(`直接沿用的原作地点：${selectedLocationNames.join("、")}`);
    }
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
