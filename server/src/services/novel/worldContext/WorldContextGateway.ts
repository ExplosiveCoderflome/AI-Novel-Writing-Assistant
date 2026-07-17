import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { NovelWorldGenerateInput } from "@ai-novel/shared/types/novelWorld";
import type {
  StoryWorldSlice,
  StoryWorldSliceBuilderMode,
  StoryWorldSliceForce,
  StoryWorldSliceLocation,
} from "@ai-novel/shared/types/storyWorldSlice";
import { NovelWorldSliceService } from "../storyWorldSlice/NovelWorldSliceService";
import { NovelWorldInstanceService } from "./NovelWorldInstanceService";
import { prisma } from "../../../db/prisma";
import { VirtualCameraNarrativeEngine } from "../../world/VirtualCameraNarrativeEngine";

export type WorldContextPurpose = "outline" | "character" | "chapter" | "bible" | "optimize";
export type WorldContextStrength = "light" | "normal" | "strict";

export interface WorldContextBlock {
  novelWorldId: string;
  sourceType: "story_slice";
  purpose: WorldContextPurpose;
  strength: WorldContextStrength;
  summaryText: string;
  promptBlock: string;
  worldRulesText: string;
  worldStageText: string;
  hardRules: string[];
  softRules: string[];
  activeForces: Array<{
    id: string;
    name: string;
    roleInStory: string;
    pressure: string;
  }>;
  activeLocations: Array<{
    id: string;
    name: string;
    storyUse: string;
  }>;
  forbiddenCombinations: string[];
  expansionHints: string[];
  rawSlice: StoryWorldSlice;
  cameraFeedText?: string;
}

export interface WorldContextGatewayOptions {
  purpose: WorldContextPurpose;
  strength?: WorldContextStrength;
  forceRefresh?: boolean;
  storyInput?: string;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export interface WorldContextGatewayGenerateOptions extends NovelWorldGenerateInput {
  storyMacroContext?: string;
  bookContractContext?: string;
}

function compactList(items: string[], fallback = "暂无"): string {
  const normalized = items.map((item) => item.trim()).filter(Boolean);
  return normalized.length > 0 ? normalized.map((item) => `- ${item}`).join("\n") : fallback;
}

function mapPurposeToBuilderMode(purpose: WorldContextPurpose): StoryWorldSliceBuilderMode {
  switch (purpose) {
    case "outline":
      return "outline";
    case "bible":
      return "bible";
    case "character":
    case "chapter":
    case "optimize":
      return "runtime";
    default:
      return "runtime";
  }
}

function formatRule(rule: StoryWorldSlice["appliedRules"][number]): string {
  return [
    rule.name,
    rule.summary ? `说明：${rule.summary}` : "",
    rule.whyItMatters ? `影响：${rule.whyItMatters}` : "",
  ].filter(Boolean).join(" | ");
}

function formatForce(force: StoryWorldSlice["activeForces"][number]): string {
  return [
    force.name,
    force.roleInStory ? `本书作用：${force.roleInStory}` : "",
    force.pressure ? `施压方式：${force.pressure}` : "",
    force.summary ? `概述：${force.summary}` : "",
  ].filter(Boolean).join(" | ");
}

function formatLocation(location: StoryWorldSlice["activeLocations"][number]): string {
  return [
    location.name,
    location.storyUse ? `剧情用途：${location.storyUse}` : "",
    location.risk ? `风险：${location.risk}` : "",
    location.summary ? `概述：${location.summary}` : "",
  ].filter(Boolean).join(" | ");
}

function buildPurposeLead(purpose: WorldContextPurpose): string {
  switch (purpose) {
    case "character":
      return "角色生成必须贴合本书世界：优先使用活跃势力、身份边界、地点压力和禁止搭配，不要生成脱离世界规则的人设。";
    case "outline":
      return "故事规划必须使用本书世界：优先围绕核心规则、压力来源、开局入口和扩展边界设计主线。";
    case "chapter":
      return "章节生成必须遵守本书世界：只使用当前切片允许的规则、地点、势力和压力源。";
    case "bible":
      return "Bible 只能汇总本书世界手册，不能把世界规则改写成另一套权威来源。";
    case "optimize":
      return "优化与审校必须检查文本是否越过本书世界边界、硬规则和禁止搭配。";
    default:
      return "生成必须遵守本书世界边界。";
  }
}

export function buildWorldContextBlockFromSlice(input: {
  slice: StoryWorldSlice;
  purpose: WorldContextPurpose;
  strength?: WorldContextStrength;
  novelWorldId?: string;
  cameraFeedText?: string;
}): WorldContextBlock {
  const { slice, purpose } = input;
  const strength = input.strength ?? "normal";
  const hardRules = slice.appliedRules.map(formatRule).filter(Boolean);
  const activeForces = slice.activeForces.map((force: StoryWorldSliceForce) => ({
    id: force.id,
    name: force.name,
    roleInStory: force.roleInStory,
    pressure: force.pressure,
  }));
  const activeLocations = slice.activeLocations.map((location: StoryWorldSliceLocation) => ({
    id: location.id,
    name: location.name,
    storyUse: location.storyUse,
  }));

  const worldRulesText = [
    slice.coreWorldFrame ? `世界底色：${slice.coreWorldFrame}` : "",
    hardRules.length > 0 ? `硬规则：\n${compactList(hardRules)}` : "",
    slice.forbiddenCombinations.length > 0
      ? `禁止搭配：\n${compactList(slice.forbiddenCombinations)}`
      : "",
    slice.storyScopeBoundary ? `本书边界：${slice.storyScopeBoundary}` : "",
  ].filter(Boolean).join("\n\n");

  const worldStageText = [
    slice.coreWorldFrame ? `核心舞台：${slice.coreWorldFrame}` : "",
    slice.activeForces.length > 0
      ? `活跃势力：\n${slice.activeForces.map((force: StoryWorldSliceForce) => `- ${formatForce(force)}`).join("\n")}`
      : "",
    slice.activeLocations.length > 0
      ? `本书舞台：\n${slice.activeLocations.map((location: StoryWorldSliceLocation) => `- ${formatLocation(location)}`).join("\n")}`
      : "",
    slice.pressureSources.length > 0 ? `压力来源：\n${compactList(slice.pressureSources)}` : "",
    slice.conflictCandidates.length > 0 ? `可展开冲突：\n${compactList(slice.conflictCandidates)}` : "",
    slice.recommendedEntryPoints.length > 0 ? `适合切入口：\n${compactList(slice.recommendedEntryPoints)}` : "",
  ].filter(Boolean).join("\n\n");

  const promptBlock = [
    `【本书世界上下文｜用途：${purpose}｜强度：${strength}】`,
    buildPurposeLead(purpose),
    worldRulesText,
    worldStageText,
    slice.mysterySources.length > 0 ? `悬念来源：\n${compactList(slice.mysterySources)}` : "",
    slice.suggestedStoryAxes.length > 0 ? `故事轴建议：\n${compactList(slice.suggestedStoryAxes)}` : "",
    input.cameraFeedText ? `【环境与物理传感器观察】\n${input.cameraFeedText}` : "",
  ].filter(Boolean).join("\n\n");

  return {
    novelWorldId: input.novelWorldId ?? slice.worldId,
    sourceType: "story_slice",
    purpose,
    strength,
    summaryText: slice.coreWorldFrame,
    promptBlock,
    worldRulesText,
    worldStageText,
    hardRules,
    softRules: [],
    activeForces,
    activeLocations,
    forbiddenCombinations: slice.forbiddenCombinations,
    expansionHints: [
      ...slice.recommendedEntryPoints,
      ...slice.suggestedStoryAxes,
    ],
    rawSlice: slice,
    cameraFeedText: input.cameraFeedText,
  };
}

export class WorldContextGateway {
  constructor(
    private readonly worldSliceService = new NovelWorldSliceService(),
    private readonly novelWorldService = new NovelWorldInstanceService(),
  ) {}

  async hasActiveWorld(novelId: string): Promise<boolean> {
    const novelWorld = await this.novelWorldService.ensureFromLegacyNovel(novelId);
    if (novelWorld) {
      return true;
    }
    const view = await this.worldSliceService.getWorldSliceView(novelId);
    return view.hasWorld;
  }

  async getWorldContextBlock(
    novelId: string,
    options: WorldContextGatewayOptions,
  ): Promise<WorldContextBlock | null> {
    const novelWorld = await this.novelWorldService.ensureFromLegacyNovel(novelId);
    const builderMode = mapPurposeToBuilderMode(options.purpose);
    const slice = options.forceRefresh
      ? (await this.worldSliceService.refreshWorldSlice(novelId, {
        builderMode,
        storyInput: options.storyInput,
        provider: options.provider,
        model: options.model,
        temperature: options.temperature,
      })).slice
      : await this.worldSliceService.ensureStoryWorldSlice(novelId, {
        builderMode,
        storyInput: options.storyInput,
      });

    if (!slice) {
      return null;
    }
    await this.novelWorldService.persistStorySlice(novelId, slice);
    const persistedNovelWorld = novelWorld ?? await this.novelWorldService.getByNovelId(novelId);

    // 查取当前最新 Sandbox Chronology 真实的 Camera Feed 织入
    let cameraFeedText = "";
    try {
      const mainBranch = await prisma.sandboxBranch.findFirst({
        where: { novelId, isMain: true }
      });
      if (mainBranch) {
        const latestChronology = await prisma.sandboxChronology.findFirst({
          where: { branchId: mainBranch.id },
          orderBy: { tickIndex: "desc" }
        });
        if (latestChronology && latestChronology.observableDetails) {
          cameraFeedText = latestChronology.observableDetails;
        }
      }
    } catch (e) {
      console.error("Failed to query sandbox chronology for context assembly:", e);
    }

    return buildWorldContextBlockFromSlice({
      slice,
      purpose: options.purpose,
      strength: options.strength,
      novelWorldId: persistedNovelWorld?.id,
      cameraFeedText
    });
  }

  async generateWorldFromNovelTheme(
    novelId: string,
    options: WorldContextGatewayGenerateOptions = {},
  ) {
    return this.novelWorldService.generateFromNovelTheme({
      novelId,
      saveToLibrary: options.saveToLibrary,
      provider: options.provider,
      model: options.model,
      temperature: options.temperature,
      storyMacroContext: options.storyMacroContext,
      bookContractContext: options.bookContractContext,
    });
  }
}
