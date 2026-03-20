import type {
  StoryWorldSlice,
  StoryWorldSliceForce,
  StoryWorldSliceLocation,
  StoryWorldSliceRule,
} from "@ai-novel/shared/types/storyWorldSlice";

export interface LegacyWorldContextSource {
  name: string;
  worldType?: string | null;
  description?: string | null;
  axioms?: string | null;
  background?: string | null;
  geography?: string | null;
  magicSystem?: string | null;
  politics?: string | null;
  races?: string | null;
  religions?: string | null;
  technology?: string | null;
  conflicts?: string | null;
  history?: string | null;
  economy?: string | null;
  factions?: string | null;
}

function formatRule(rule: StoryWorldSliceRule): string {
  return [
    rule.name,
    rule.summary && `说明: ${rule.summary}`,
    rule.whyItMatters && `作用: ${rule.whyItMatters}`,
  ].filter(Boolean).join(" | ");
}

function formatForce(force: StoryWorldSliceForce): string {
  return [
    force.name,
    force.summary && `概述: ${force.summary}`,
    force.roleInStory && `在这本书里的作用: ${force.roleInStory}`,
    force.pressure && `会带来的压力: ${force.pressure}`,
  ].filter(Boolean).join(" | ");
}

function formatLocation(location: StoryWorldSliceLocation): string {
  return [
    location.name,
    location.summary && `概述: ${location.summary}`,
    location.storyUse && `适合承载的剧情: ${location.storyUse}`,
    location.risk && `风险: ${location.risk}`,
  ].filter(Boolean).join(" | ");
}

export function formatStoryWorldSlicePromptBlock(slice: StoryWorldSlice): string {
  return [
    "这本书会用到的世界设定：",
    slice.coreWorldFrame ? `核心舞台：${slice.coreWorldFrame}` : "",
    slice.appliedRules.length > 0
      ? `当前必须遵守的规则：\n${slice.appliedRules.map((item) => `- ${formatRule(item)}`).join("\n")}`
      : "",
    slice.activeForces.length > 0
      ? `当前会介入故事的组织与势力：\n${slice.activeForces.map((item) => `- ${formatForce(item)}`).join("\n")}`
      : "",
    slice.activeLocations.length > 0
      ? `当前会被真正用到的地点：\n${slice.activeLocations.map((item) => `- ${formatLocation(item)}`).join("\n")}`
      : "",
    slice.conflictCandidates.length > 0
      ? `可直接展开的冲突方向：\n${slice.conflictCandidates.map((item) => `- ${item}`).join("\n")}`
      : "",
    slice.pressureSources.length > 0
      ? `主要压力来源：\n${slice.pressureSources.map((item) => `- ${item}`).join("\n")}`
      : "",
    slice.mysterySources.length > 0
      ? `可持续吊住读者的问题：\n${slice.mysterySources.map((item) => `- ${item}`).join("\n")}`
      : "",
    slice.suggestedStoryAxes.length > 0
      ? `优先推进的故事轴：\n${slice.suggestedStoryAxes.map((item) => `- ${item}`).join("\n")}`
      : "",
    slice.recommendedEntryPoints.length > 0
      ? `适合开场的切入口：\n${slice.recommendedEntryPoints.map((item) => `- ${item}`).join("\n")}`
      : "",
    slice.forbiddenCombinations.length > 0
      ? `不要越界的搭配：\n${slice.forbiddenCombinations.map((item) => `- ${item}`).join("\n")}`
      : "",
    slice.storyScopeBoundary ? `本书边界：${slice.storyScopeBoundary}` : "",
  ].filter(Boolean).join("\n\n");
}

export function buildLegacyWorldContextFromWorld(world: LegacyWorldContextSource | null | undefined): string {
  if (!world) {
    return "世界上下文：暂无";
  }

  let axiomsText = "";
  if (world.axioms) {
    try {
      const parsed = JSON.parse(world.axioms) as string[];
      axiomsText = Array.isArray(parsed) && parsed.length > 0
        ? parsed.map((item) => `- ${item}`).join("\n")
        : world.axioms;
    } catch {
      axiomsText = world.axioms;
    }
  }

  return [
    "世界上下文：",
    `世界名称：${world.name}`,
    `世界类型：${world.worldType ?? "未指定"}`,
    `世界简介：${world.description ?? ""}`,
    "核心公理：",
    axiomsText,
    `背景：${world.background ?? ""}`,
    `地理：${world.geography ?? ""}`,
    `力量体系：${world.magicSystem ?? ""}`,
    `社会政治：${world.politics ?? ""}`,
    `种族：${world.races ?? ""}`,
    `宗教：${world.religions ?? ""}`,
    `科技：${world.technology ?? ""}`,
    `历史：${world.history ?? ""}`,
    `经济：${world.economy ?? ""}`,
    `势力关系：${world.factions ?? ""}`,
    `核心冲突：${world.conflicts ?? ""}`,
  ].join("\n");
}
