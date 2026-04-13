import type {
  CreativeHubNovelSetupChecklistItem,
  CreativeHubNovelSetupStage,
  CreativeHubNovelSetupStatus,
} from "@ai-novel/shared/types/creativeHub";
import { prisma } from "../../db/prisma";

type NovelSetupSource = {
  id: string;
  title: string;
  description: string | null;
  projectMode:
    | "ai_led"
    | "co_pilot"
    | "draft_mode"
    | "auto_pipeline"
    | null;
  narrativePov: "first_person" | "third_person" | "mixed" | null;
  pacePreference: "slow" | "balanced" | "fast" | null;
  styleTone: string | null;
  emotionIntensity: "low" | "medium" | "high" | null;
  aiFreedom: "low" | "medium" | "high" | null;
  primaryStoryMode: { name: string } | null;
  secondaryStoryMode: { name: string } | null;
  defaultChapterLength: number | null;
  outline: string | null;
  structuredOutline: string | null;
  genre: { name: string } | null;
  world: { id: string; name: string } | null;
  bible: {
    coreSetting: string | null;
    forbiddenRules: string | null;
    mainPromise: string | null;
    characterArcs: string | null;
    worldRules: string | null;
  } | null;
  _count: {
    characters: number;
    chapters: number;
  };
};

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function compactText(value: string | null | undefined, maxLength = 72): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function joinCurrentValues(values: Array<string | null | undefined>): string | null {
  const normalized = values.map((item) => item?.trim()).filter((item): item is string => Boolean(item));
  return normalized.length > 0 ? normalized.join(" / ") : null;
}

function projectModeLabel(value: NovelSetupSource["projectMode"]): string | null {
  switch (value) {
    case "ai_led":
      return "AI 主导";
    case "co_pilot":
      return "人机协作";
    case "draft_mode":
      return "草稿优先";
    case "auto_pipeline":
      return "自动流水线";
    default:
      return null;
  }
}

function narrativePovLabel(value: NovelSetupSource["narrativePov"]): string | null {
  switch (value) {
    case "first_person":
      return "第一人称";
    case "third_person":
      return "第三人称";
    case "mixed":
      return "混合视角";
    default:
      return null;
  }
}

function pacePreferenceLabel(value: NovelSetupSource["pacePreference"]): string | null {
  switch (value) {
    case "slow":
      return "慢节奏";
    case "balanced":
      return "均衡节奏";
    case "fast":
      return "快节奏";
    default:
      return null;
  }
}

function emotionIntensityLabel(value: NovelSetupSource["emotionIntensity"]): string | null {
  switch (value) {
    case "low":
      return "低情绪强度";
    case "medium":
      return "中等情绪强度";
    case "high":
      return "高情绪强度";
    default:
      return null;
  }
}

function aiFreedomLabel(value: NovelSetupSource["aiFreedom"]): string | null {
  switch (value) {
    case "low":
      return "低 AI 自由度";
    case "medium":
      return "中 AI 自由度";
    case "high":
      return "高 AI 自由度";
    default:
      return null;
  }
}

function withStatus(input: {
  key: CreativeHubNovelSetupChecklistItem["key"];
  label: string;
  status: CreativeHubNovelSetupChecklistItem["status"];
  summary: string;
  currentValue?: string | null;
  requiredForProduction?: boolean;
  recommendedAction?: string;
  optionPrompt?: string;
}): CreativeHubNovelSetupChecklistItem {
  return {
    key: input.key,
    label: input.label,
    status: input.status,
    summary: input.summary,
    currentValue: input.currentValue ?? null,
    requiredForProduction: input.requiredForProduction ?? false,
    ...(input.recommendedAction ? { recommendedAction: input.recommendedAction } : {}),
    ...(input.optionPrompt ? { optionPrompt: input.optionPrompt } : {}),
  };
}

function buildChecklist(novel: NovelSetupSource): CreativeHubNovelSetupChecklistItem[] {
  const premiseLength = novel.description?.trim().length ?? 0;
  const premiseStatus = premiseLength >= 80 ? "ready" : premiseLength > 0 ? "partial" : "missing";
  const storyPromiseStatus = hasText(novel.bible?.mainPromise)
    ? "ready"
    : premiseLength >= 80
      ? "partial"
      : "missing";
  const directionSignals = [Boolean(novel.genre?.name), hasText(novel.styleTone)].filter(Boolean).length;
  const storyModeSignals = [Boolean(novel.primaryStoryMode?.name), Boolean(novel.secondaryStoryMode?.name)].filter(Boolean).length;
  const narrativeSignals = [Boolean(novel.narrativePov), Boolean(novel.pacePreference)].filter(Boolean).length;
  const productionSignals = [
    Boolean(novel.projectMode),
    Boolean(novel.emotionIntensity),
    Boolean(novel.aiFreedom),
  ].filter(Boolean).length;
  const chapterScaleStatus = typeof novel.defaultChapterLength === "number" && novel.defaultChapterLength > 0
    ? "ready"
    : novel._count.chapters > 0 || hasText(novel.structuredOutline)
      ? "partial"
      : "missing";
  const worldStatus = novel.world
    ? "ready"
    : hasText(novel.bible?.coreSetting)
      ? "partial"
      : "missing";
  const worldRulesStatus = hasText(novel.bible?.worldRules) || hasText(novel.bible?.forbiddenRules)
    ? "ready"
    : novel.world || hasText(novel.bible?.coreSetting)
      ? "partial"
      : "missing";
  const characterStatus = novel._count.characters > 0
    ? "ready"
    : hasText(novel.bible?.characterArcs)
      ? "partial"
      : "missing";
  const outlineStatus = novel.structuredOutline?.trim()
    ? "ready"
    : novel._count.chapters > 0 || hasText(novel.outline)
      ? "partial"
      : "missing";

  return [
    withStatus({
      key: "premise",
      label: "核心设定",
      status: premiseStatus,
      summary: premiseStatus === "ready"
        ? "主角、冲突和故事目标已经明确。"
        : premiseStatus === "partial"
          ? "已有简介，但冲突和故事承诺还不够稳定。"
          : "还缺清晰的一句话设定，需要先说清主角、冲突和目标。",
      currentValue: compactText(novel.description),
      requiredForProduction: true,
      recommendedAction: "请先补齐当前小说的核心设定，明确主角、核心冲突、目标与题材承诺，并整理成可直接写入简介的版本。",
      optionPrompt: "基于当前标题和已有信息，为这本小说提供 3 套核心设定备选。每套都要包含主角、核心冲突、目标和题材气质。",
    }),
    withStatus({
      key: "story_promise",
      label: "故事承诺",
      status: storyPromiseStatus,
      summary: storyPromiseStatus === "ready"
        ? "主线卖点、情绪落点和读者预期已经明确。"
        : storyPromiseStatus === "partial"
          ? "已有基础设定，但主线承诺和阅读期待还不够鲜明。"
          : "还缺这本书最核心的故事承诺和阅读预期。",
      currentValue: compactText(novel.bible?.mainPromise ?? novel.description),
      requiredForProduction: true,
      recommendedAction: "请结合当前设定，补齐这本书的故事承诺：主线卖点、情绪走向、结局预期，以及读者为什么会想追下去。",
      optionPrompt: "基于当前设定，为这本小说提供 3 套故事承诺备选。每套都要说明卖点、情绪走向和读者期待。",
    }),
    withStatus({
      key: "direction",
      label: "题材与风格",
      status: directionSignals >= 2 ? "ready" : directionSignals === 1 ? "partial" : "missing",
      summary: directionSignals >= 2
        ? "题材类型和风格气质都已确定。"
        : directionSignals === 1
          ? "已有部分方向信息，建议补齐题材或风格基调。"
          : "还没有明确题材和风格气质。",
      currentValue: joinCurrentValues([novel.genre?.name ?? null, compactText(novel.styleTone, 36)]),
      requiredForProduction: true,
      recommendedAction: "请为当前小说明确题材标签和风格气质，说明它更偏热血、悬疑、治愈、黑暗还是轻松，并给出一句风格说明。",
      optionPrompt: "结合当前设定，为这本小说提供 3 套题材与风格组合备选，并说明各自适合的读者感受。",
    }),
    withStatus({
      key: "story_mode",
      label: "流派模式",
      status: storyModeSignals >= 2 ? "ready" : storyModeSignals === 1 ? "partial" : "missing",
      summary: storyModeSignals >= 2
        ? "主副流派模式都已明确，后续规划有稳定控制轴。"
        : storyModeSignals === 1
          ? "已设置部分流派模式，但建议至少补齐主模式以稳定后续规划。"
          : "还没有定义这本书靠什么推进、靠什么兑现以及冲突边界。",
      currentValue: joinCurrentValues([novel.primaryStoryMode?.name ?? null, novel.secondaryStoryMode?.name ?? null]),
      requiredForProduction: true,
      recommendedAction: "请先确定当前小说的主流派模式，必要时再补充一个副流派模式。这样系统才能稳定约束后续的故事规划、角色设计和卷章生成。",
      optionPrompt: "基于当前题材、卖点和前 30 章承诺，为这本小说提供 3 套主副流派模式组合建议，并说明各自的推进逻辑、读者奖励和冲突边界。",
    }),
    withStatus({
      key: "narrative",
      label: "叙事配置",
      status: narrativeSignals >= 2 ? "ready" : narrativeSignals > 0 ? "partial" : "missing",
      summary: narrativeSignals >= 2
        ? "叙事视角和节奏偏好都已确定。"
        : narrativeSignals > 0
          ? "已有部分叙事配置，建议补齐视角与节奏。"
          : "还没有确定叙事视角与推进节奏。",
      currentValue: joinCurrentValues([
        narrativePovLabel(novel.narrativePov),
        pacePreferenceLabel(novel.pacePreference),
      ]),
      requiredForProduction: true,
      recommendedAction: "请确定这本书更适合使用什么叙事视角、什么推进节奏，并简要说明原因。",
      optionPrompt: "基于当前题材和设定，为这本小说提供 3 套叙事配置备选。每套都包含视角和节奏，并说明优缺点。",
    }),
    withStatus({
      key: "production_preferences",
      label: "生产偏好",
      status: productionSignals >= 3 ? "ready" : productionSignals > 0 ? "partial" : "missing",
      summary: productionSignals >= 3
        ? "创作协作方式、情绪强度和 AI 自由度都已明确。"
        : productionSignals > 0
          ? "已有部分生产偏好，但还不够稳定。"
          : "还没有确定协作模式、情绪强度和 AI 自由度。",
      currentValue: joinCurrentValues([
        projectModeLabel(novel.projectMode),
        emotionIntensityLabel(novel.emotionIntensity),
        aiFreedomLabel(novel.aiFreedom),
      ]),
      requiredForProduction: true,
      recommendedAction: "请补齐当前小说的生产偏好，包括协作模式、情绪强度和 AI 自由度，说明哪些部分必须保守、哪些可以放开创作。",
      optionPrompt: "基于当前题材和目标，为这本小说提供 3 套生产偏好备选。每套都要包含协作模式、情绪强度和 AI 自由度。",
    }),
    withStatus({
      key: "chapter_scale",
      label: "章节规格",
      status: chapterScaleStatus,
      summary: chapterScaleStatus === "ready"
        ? "默认章长和章节粒度已明确。"
        : chapterScaleStatus === "partial"
          ? "已有章节规划，但还没确认默认章长。"
          : "还没有确认单章大致字数和章节粒度。",
      currentValue: typeof novel.defaultChapterLength === "number" && novel.defaultChapterLength > 0
        ? `默认章长约 ${novel.defaultChapterLength} 字`
        : novel._count.chapters > 0
          ? `已有 ${novel._count.chapters} 个章节目录`
          : null,
      requiredForProduction: true,
      recommendedAction: "请结合题材和节奏，确认这本书的默认章长范围，以及单章更偏事件推进、情绪推进还是信息揭示。",
      optionPrompt: "基于当前题材和节奏，为这本小说提供 3 套章节规格备选。每套都包含建议章长和单章推进方式。",
    }),
    withStatus({
      key: "world",
      label: "世界观基础",
      status: worldStatus,
      summary: worldStatus === "ready"
        ? `世界观已绑定${novel.world ? `《${novel.world.name}》` : ""}。`
        : worldStatus === "partial"
          ? "已有世界规则种子，但还没形成可复用的世界观。"
          : "还缺世界观种子或基本舞台信息。",
      currentValue: novel.world?.name ?? compactText(novel.bible?.coreSetting, 48),
      requiredForProduction: true,
      recommendedAction: "请先补齐这本书的世界观种子，说明故事舞台、时代背景、基础规则以及会影响主线冲突的环境设定。",
      optionPrompt: "结合当前题材和核心设定，为这本小说提供 3 套世界观基础设定备选，并说明各自的冲突潜力。",
    }),
    withStatus({
      key: "world_rules",
      label: "规则边界",
      status: worldRulesStatus,
      summary: worldRulesStatus === "ready"
        ? "世界运行规则、禁忌或硬边界已经明确。"
        : worldRulesStatus === "partial"
          ? "已有世界框架，但还没明确关键规则与禁忌。"
          : "还没有整理出会约束剧情的世界规则或禁忌。",
      currentValue: compactText(novel.bible?.worldRules ?? novel.bible?.forbiddenRules, 56),
      requiredForProduction: false,
      recommendedAction: "请提炼这本书必须遵守的世界规则、禁忌和硬边界，尤其是会直接影响剧情推进与角色行动的部分。",
      optionPrompt: "基于当前设定，为这本小说提供 3 套世界规则与禁忌备选，每套都要说明会如何影响剧情。",
    }),
    withStatus({
      key: "characters",
      label: "角色基础",
      status: characterStatus,
      summary: characterStatus === "ready"
        ? `已有 ${novel._count.characters} 个角色进入当前小说。`
        : characterStatus === "partial"
          ? "已有角色弧线描述，但还没形成稳定角色清单。"
          : "还没有主角和核心角色草案。",
      currentValue: novel._count.characters > 0
        ? `${novel._count.characters} 个角色`
        : compactText(novel.bible?.characterArcs, 48),
      requiredForProduction: true,
      recommendedAction: "请先整理当前小说的主角与核心角色，至少明确角色定位、目标、阻力和彼此冲突关系。",
      optionPrompt: "基于当前设定，为这本小说提供 3 组核心角色阵容备选，每组都说明主角、对手与关键关系。",
    }),
    withStatus({
      key: "outline",
      label: "大纲与章节计划",
      status: outlineStatus,
      summary: outlineStatus === "ready"
        ? "已有结构化大纲或可执行章节规划。"
        : outlineStatus === "partial"
          ? "已有故事走向，但还没拆成稳定的章节规划。"
          : "还没有可执行的大纲和章节推进计划。",
      currentValue: novel.structuredOutline?.trim()
        ? "已生成结构化大纲"
        : novel.outline?.trim()
          ? "已生成发展走向"
          : novel._count.chapters > 0
            ? `已有 ${novel._count.chapters} 个章节目录`
            : null,
      requiredForProduction: true,
      recommendedAction: "请把当前设定整理成可执行的大纲，并拆出章节推进计划，至少明确开篇、前中后段转折和结局落点。",
      optionPrompt: "基于当前设定，为这本小说提供 3 套大纲推进方案备选，并说明各自的章节节奏。",
    }),
  ];
}

function buildStage(checklist: CreativeHubNovelSetupChecklistItem[]): CreativeHubNovelSetupStage {
  const requiredItems = checklist.filter((item) => item.requiredForProduction);
  if (requiredItems.length > 0 && requiredItems.every((item) => item.status === "ready")) {
    return "ready_for_production";
  }

  const byKey = Object.fromEntries(checklist.map((item) => [item.key, item])) as Record<
    CreativeHubNovelSetupChecklistItem["key"],
    CreativeHubNovelSetupChecklistItem
  >;

  if (
    byKey.premise.status !== "missing"
    && byKey.direction.status !== "missing"
    && byKey.story_mode.status !== "missing"
    && byKey.narrative.status !== "missing"
    && byKey.story_promise.status !== "missing"
  ) {
    return "ready_for_planning";
  }

  return "setup_in_progress";
}

function weightedCompletion(checklist: CreativeHubNovelSetupChecklistItem[]): number {
  const total = checklist.reduce((sum, item) => {
    if (item.status === "ready") return sum + 1;
    if (item.status === "partial") return sum + 0.5;
    return sum;
  }, 0);
  return Math.round((total / checklist.length) * 100);
}

function buildNextStep(checklist: CreativeHubNovelSetupChecklistItem[], stage: CreativeHubNovelSetupStage) {
  const next = checklist.find((item) => item.requiredForProduction && item.status !== "ready")
    ?? checklist.find((item) => item.status !== "ready");
  if (!next) {
    return {
      nextQuestion: "初始化已经基本完成。你想先检查大纲、补细节，还是直接启动整本生产？",
      recommendedAction: "先总结这本书当前的初始化信息，再给我三个下一步选项：补细节、看大纲、启动整本生产。",
    };
  }

  switch (next.key) {
    case "premise":
      return {
        nextQuestion: "这本书想讲谁、遇到什么冲突、最后要把故事推向哪里？",
        recommendedAction: "先帮我补这本书的一句话设定，明确主角、核心冲突和故事承诺。",
      };
    case "story_promise":
      return {
        nextQuestion: "这本书最想让读者期待什么，读完后又应该留下什么感受？",
        recommendedAction: "先补齐这本书的故事承诺、情绪落点和阅读期待。",
      };
    case "direction":
      return {
        nextQuestion: "你想把这本书写成什么题材、什么气质？",
        recommendedAction: "基于当前书名和设定，先补齐这本书的题材类型和风格气质。",
      };
    case "story_mode":
      return {
        nextQuestion: "请先确认这本书靠什么推进、靠什么兑现，以及冲突的上限应该放在哪里？",
        recommendedAction: "先补齐主流派模式，必要时再补一个副流派模式，让后续规划和生成不会越写越偏。",
      };
    case "narrative":
      return {
        nextQuestion: "这本书更适合用什么视角、什么节奏，以及什么协作方式来写？",
        recommendedAction: "帮我确定这本书的叙事视角、节奏偏好和创作模式。",
      };
    case "production_preferences":
      return {
        nextQuestion: "这本书希望 AI 放开到什么程度，情绪强度要压到哪里，哪些地方必须保守？",
        recommendedAction: "先确定协作模式、情绪强度和 AI 自由度，再继续生产准备。",
      };
    case "chapter_scale":
      return {
        nextQuestion: "这本书一章大概写多长，单章更偏事件推进还是情绪推进？",
        recommendedAction: "先确认默认章长和章节粒度，避免后续生产偏差过大。",
      };
    case "world":
      return {
        nextQuestion: "故事发生在什么样的世界里？要不要先搭一个世界观种子？",
        recommendedAction: "结合当前设定，先为这本书补一个世界观种子，并说明关键规则。",
      };
    case "world_rules":
      return {
        nextQuestion: "这个世界有哪些绝对不能碰的规则、禁忌或代价？",
        recommendedAction: "先整理世界规则与禁忌，明确哪些边界会直接影响剧情。",
      };
    case "characters":
      return {
        nextQuestion: "主角是谁，他最想得到什么，又会被什么阻挡？",
        recommendedAction: "先整理这本书的主角和核心角色草案，至少给出角色定位和冲突关系。",
      };
    case "outline":
      return {
        nextQuestion: stage === "ready_for_planning"
          ? "设定已经够用了，要不要先把它拆成大纲和章节规划？"
          : "要不要先把现有设定整理成可执行的大纲？",
        recommendedAction: "基于当前设定，先生成这本书的大纲，并拆出章节推进计划。",
      };
    default:
      return {
        nextQuestion: "你想先补哪一部分设定？",
        recommendedAction: "先总结当前缺失项，并给我一个最小初始化方案。",
      };
  }
}

function buildStatus(novel: NovelSetupSource): CreativeHubNovelSetupStatus {
  const checklist = buildChecklist(novel);
  const stage = buildStage(checklist);
  const completedCount = checklist.filter((item) => item.status === "ready").length;
  const totalCount = checklist.length;
  const { nextQuestion, recommendedAction } = buildNextStep(checklist, stage);

  return {
    novelId: novel.id,
    title: novel.title,
    stage,
    completionRatio: weightedCompletion(checklist),
    completedCount,
    totalCount,
    missingItems: checklist.filter((item) => item.status !== "ready").map((item) => item.label),
    nextQuestion,
    recommendedAction,
    checklist,
  };
}

export class NovelSetupStatusService {
  async getNovelSetupStatus(novelId: string): Promise<CreativeHubNovelSetupStatus | null> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        id: true,
        title: true,
        description: true,
        projectMode: true,
        narrativePov: true,
        pacePreference: true,
        styleTone: true,
        emotionIntensity: true,
        aiFreedom: true,
        primaryStoryMode: {
          select: {
            name: true,
          },
        },
        secondaryStoryMode: {
          select: {
            name: true,
          },
        },
        defaultChapterLength: true,
        outline: true,
        structuredOutline: true,
        genre: {
          select: {
            name: true,
          },
        },
        world: {
          select: {
            id: true,
            name: true,
          },
        },
        bible: {
          select: {
            coreSetting: true,
            forbiddenRules: true,
            mainPromise: true,
            characterArcs: true,
            worldRules: true,
          },
        },
        _count: {
          select: {
            characters: true,
            chapters: true,
          },
        },
      },
    });

    if (!novel) {
      return null;
    }

    return buildStatus(novel);
  }
}

export const novelSetupStatusService = new NovelSetupStatusService();
