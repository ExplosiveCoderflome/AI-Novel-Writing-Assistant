import type { DirectorTakeoverEntryStep, DirectorTakeoverStageReadiness, DirectorTakeoverStartPhase } from "@ai-novel/shared/types/novelDirector";
import type { DirectorTakeoverNovelContext } from "./novelDirectorTakeover";

export const DIRECTOR_TAKEOVER_STAGE_META: Record<
  DirectorTakeoverStartPhase,
  Pick<DirectorTakeoverStageReadiness, "label" | "description">
> = {
  story_macro: {
    label: "从故事宏观规划开始",
    description: "先补齐 Story Macro 和 Book Contract，再继续角色、卷战略和拆章。",
  },
  world_setup: {
    label: "从世界观准备开始",
    description: "沿用故事宏观规划，先完成本书世界观，再继续角色和后续规划。",
  },
  character_setup: {
    label: "从角色准备开始",
    description: "沿用已有书级方向，只让 AI 接手角色阵容和后续规划。",
  },
  volume_strategy: {
    label: "从卷战略开始",
    description: "沿用现有书级方向和角色，继续生成卷战略与卷骨架。",
  },
  structured_outline: {
    label: "从节奏 / 拆章开始",
    description: "沿用现有卷规划，继续生成节奏板、章节列表和章节细化。",
  },
};

export const TAKEOVER_ENTRY_META: Record<
  DirectorTakeoverEntryStep,
  {
    label: string;
    description: string;
  }
> = {
  basic: {
    label: "项目设定",
    description: "从现有项目基础信息继续接管，优先补最早缺失的导演前置资产。",
  },
  story_macro: {
    label: "故事宏观规划",
    description: "围绕 Story Macro 和 Book Contract 继续或重跑书级规划。",
  },
  world: {
    label: "世界观准备",
    description: "围绕本书世界规则、势力和约束继续或重跑当前步骤。",
  },
  character: {
    label: "角色准备",
    description: "围绕角色阵容与应用继续或重跑当前步骤。",
  },
  outline: {
    label: "卷战略",
    description: "围绕卷战略与卷骨架继续或重跑当前步骤。",
  },
  structured: {
    label: "节奏 / 拆章",
    description: "围绕当前卷节奏板、章节列表和细化资源继续或重跑当前步骤。",
  },
  chapter: {
    label: "章节执行",
    description: "优先恢复当前章节批次或从已准备范围继续执行。",
  },
  pipeline: {
    label: "质量修复",
    description: "优先恢复当前修复批次，或承接待修章节继续推进。",
  },
};

export function hasMeaningfulSeedMaterial(novel: DirectorTakeoverNovelContext): boolean {
  return Boolean(
    novel.description?.trim()
    || novel.targetAudience?.trim()
    || novel.bookSellingPoint?.trim()
    || novel.competingFeel?.trim()
    || novel.first30ChapterPromise?.trim()
    || novel.commercialTags.length > 0
    || novel.genreId?.trim()
    || novel.worldId?.trim(),
  );
}

export function splitToneKeywords(novel: DirectorTakeoverNovelContext): string[] {
  const raw = [
    novel.styleTone?.trim() ?? "",
    novel.competingFeel?.trim() ?? "",
    ...novel.commercialTags,
  ]
    .filter(Boolean)
    .join("，");
  return Array.from(
    new Set(
      raw
        .split(/[，、|/]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 4);
}

export function buildTakeoverIdea(novel: DirectorTakeoverNovelContext): string {
  const lines = [
    novel.description?.trim() ? `故事概述：${novel.description.trim()}` : "",
    novel.title.trim() ? `项目标题：《${novel.title.trim()}》` : "",
    novel.targetAudience?.trim() ? `目标读者：${novel.targetAudience.trim()}` : "",
    novel.bookSellingPoint?.trim() ? `书级卖点：${novel.bookSellingPoint.trim()}` : "",
    novel.competingFeel?.trim() ? `对标气质：${novel.competingFeel.trim()}` : "",
    novel.first30ChapterPromise?.trim() ? `前30章承诺：${novel.first30ChapterPromise.trim()}` : "",
    novel.commercialTags.length > 0 ? `商业标签：${novel.commercialTags.join("、")}` : "",
  ].filter(Boolean);
  return lines.join("\n") || `项目标题：《${novel.title.trim() || "当前项目"}》`;
}
