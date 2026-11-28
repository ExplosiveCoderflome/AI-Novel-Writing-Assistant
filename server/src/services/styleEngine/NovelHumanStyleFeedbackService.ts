import {
  HUMAN_STYLE_ISSUE_TAGS,
  type HumanStyleIssueTag,
  type NovelHumanStyleFeedbackRequest,
  type NovelHumanStyleFeedbackResponse,
  type NovelHumanStyleFeedbackSummary,
  type StyleContrastPair,
} from "@ai-novel/shared/types/styleEngine";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { parseJsonArray, parseJsonObject, serializeJson } from "./helpers";
import { StyleBindingService } from "./StyleBindingService";
import { ensureStyleEngineSeedData } from "./StyleEngineSeedService";

const BOOK_FEEDBACK_SOURCE_TYPE = "from_current_work";
const MAX_BOOK_CONTRAST_PAIRS = 12;
const MAX_PATTERN_LENGTH = 260;

function compactFeedbackText(raw: string, maxLength = MAX_PATTERN_LENGTH): string {
  const normalized = raw.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function resolveTagLabels(issueTags: HumanStyleIssueTag[]): string[] {
  const labelMap = new Map(HUMAN_STYLE_ISSUE_TAGS.map((item) => [item.key, item.label]));
  return Array.from(new Set(
    issueTags
      .map((tag) => labelMap.get(tag))
      .filter((label): label is string => Boolean(label)),
  ));
}

function readContrastPairsFromJson(languageRulesJson: string | null | undefined): StyleContrastPair[] {
  const parsed = parseJsonObject<{ contrastPairs?: unknown }>(languageRulesJson);
  const raw = parsed.contrastPairs;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((item): item is StyleContrastPair => (
      Boolean(item)
      && typeof item === "object"
      && typeof (item as StyleContrastPair).aiPattern === "string"
      && typeof (item as StyleContrastPair).preferred === "string"
    ))
    .map((item) => ({
      aiPattern: item.aiPattern.trim(),
      preferred: item.preferred.trim(),
      note: typeof item.note === "string" && item.note.trim() ? item.note.trim() : null,
    }))
    .filter((item) => item.aiPattern.length > 0 && item.preferred.length > 0);
}

function buildFeedbackPair(input: NovelHumanStyleFeedbackRequest): StyleContrastPair {
  const aiPattern = compactFeedbackText(input.excerpt);
  if (aiPattern.length < 2) {
    throw new AppError("请先选中至少两个字的正文片段再标记反馈。", 400);
  }
  const tagLabels = resolveTagLabels(input.issueTags);
  const feedbackNote = input.feedbackNote?.trim() ?? "";
  const preferredText = input.preferredText?.trim() ?? "";
  const noteParts = [
    ...tagLabels,
    ...(feedbackNote ? [compactFeedbackText(feedbackNote, 120)] : []),
  ];
  const note = noteParts.join(" · ") || "作者标定纠偏";

  let preferred = preferredText ? compactFeedbackText(preferredText) : "";
  if (!preferred) {
    if (feedbackNote) {
      preferred = tagLabels.length > 0
        ? `按作者要求改写（避开${tagLabels.join("、")}）：${compactFeedbackText(feedbackNote, 180)}`
        : `按作者要求改写：${compactFeedbackText(feedbackNote, 200)}`;
    } else if (tagLabels.length > 0) {
      preferred = `用具体动作、对话与感官细节推进，避开${tagLabels.join("、")}`;
    } else {
      preferred = "用贴合当前人物处境的具体动作与口语表达替代模板化写法";
    }
  }

  return {
    aiPattern,
    preferred,
    note,
  };
}

export class NovelHumanStyleFeedbackService {
  private readonly styleBindingService = new StyleBindingService();

  async getBookFeedback(novelId: string): Promise<NovelHumanStyleFeedbackSummary> {
    await ensureStyleEngineSeedData();
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: { id: true },
    });
    if (!novel) {
      throw new AppError("小说不存在。", 404);
    }

    const { bookBinding, fallbackBinding } = await this.findBindings(novelId);
    const activeBinding = bookBinding ?? fallbackBinding;
    if (!activeBinding) {
      return {
        profileId: null,
        profileName: null,
        isBookOwned: false,
        contrastPairs: [],
      };
    }

    return {
      profileId: activeBinding.styleProfile.id,
      profileName: activeBinding.styleProfile.name,
      isBookOwned: Boolean(bookBinding),
      contrastPairs: readContrastPairsFromJson(activeBinding.styleProfile.languageRulesJson),
    };
  }

  async recordFeedback(
    novelId: string,
    chapterId: string,
    input: NovelHumanStyleFeedbackRequest,
  ): Promise<NovelHumanStyleFeedbackResponse> {
    await ensureStyleEngineSeedData();
    const [novel, chapter] = await Promise.all([
      prisma.novel.findUnique({ where: { id: novelId }, select: { id: true, title: true } }),
      prisma.chapter.findFirst({ where: { id: chapterId, novelId }, select: { id: true } }),
    ]);
    if (!novel) {
      throw new AppError("小说不存在。", 404);
    }
    if (!chapter) {
      throw new AppError("章节不存在。", 404);
    }

    const savedPair = buildFeedbackPair(input);
    const { bookBinding, fallbackBinding } = await this.findBindings(novelId);

    if (bookBinding) {
      const existingLanguageRules = parseJsonObject<Record<string, unknown>>(bookBinding.styleProfile.languageRulesJson);
      const existingPairs = readContrastPairsFromJson(bookBinding.styleProfile.languageRulesJson);
      const contrastPairs = [
        savedPair,
        ...existingPairs.filter((item) => item.aiPattern !== savedPair.aiPattern),
      ].slice(0, MAX_BOOK_CONTRAST_PAIRS);

      await prisma.styleProfile.update({
        where: { id: bookBinding.styleProfile.id },
        data: {
          languageRulesJson: serializeJson({
            ...existingLanguageRules,
            contrastPairs,
          }),
        },
      });

      return {
        profileId: bookBinding.styleProfile.id,
        profileName: bookBinding.styleProfile.name,
        isBookOwned: true,
        createdBookProfile: false,
        savedPair,
        contrastPairs,
      };
    }

    const baseProfile = fallbackBinding?.styleProfile ?? null;
    const baseLanguageRules = parseJsonObject<Record<string, unknown>>(baseProfile?.languageRulesJson);
    const existingPairs = readContrastPairsFromJson(baseProfile?.languageRulesJson);
    const contrastPairs = [
      savedPair,
      ...existingPairs.filter((item) => item.aiPattern !== savedPair.aiPattern),
    ].slice(0, MAX_BOOK_CONTRAST_PAIRS);

    const createdProfile = await prisma.$transaction(async (tx) => {
      const profile = await tx.styleProfile.create({
        data: {
          name: `《${novel.title}》作者写法纠偏`,
          description: "记录作者在阅读和修订中标定的 AI 味反例与偏好改法，用于后续章节生成和修文。",
          category: "book_feedback",
          tagsJson: serializeJson(["作者纠偏", "反AI表达"]),
          applicableGenresJson: serializeJson(parseJsonArray(baseProfile?.applicableGenresJson)),
          sourceType: BOOK_FEEDBACK_SOURCE_TYPE,
          sourceRefId: novelId,
          narrativeRulesJson: serializeJson(parseJsonObject(baseProfile?.narrativeRulesJson)),
          characterRulesJson: serializeJson(parseJsonObject(baseProfile?.characterRulesJson)),
          languageRulesJson: serializeJson({
            ...baseLanguageRules,
            contrastPairs,
          }),
          rhythmRulesJson: serializeJson(parseJsonObject(baseProfile?.rhythmRulesJson)),
          antiAiBindings: baseProfile?.antiAiBindings?.length
            ? {
                create: baseProfile.antiAiBindings.map((binding) => ({
                  antiAiRuleId: binding.antiAiRuleId,
                  enabled: binding.enabled,
                })),
              }
            : undefined,
        },
      });

      await tx.styleBinding.create({
        data: {
          styleProfileId: profile.id,
          targetType: "novel",
          targetId: novelId,
          priority: Math.max(10, (fallbackBinding?.priority ?? 1) + 10),
          weight: 1,
          enabled: true,
        },
      });

      return profile;
    });

    await this.styleBindingService.resolveForGeneration({ novelId }).catch(() => null);

    return {
      profileId: createdProfile.id,
      profileName: createdProfile.name,
      isBookOwned: true,
      createdBookProfile: true,
      savedPair,
      contrastPairs,
    };
  }

  async removeFeedbackPair(novelId: string, aiPattern: string): Promise<NovelHumanStyleFeedbackSummary> {
    await ensureStyleEngineSeedData();
    const targetPattern = aiPattern.trim();
    if (!targetPattern) {
      throw new AppError("缺少要移除的反例内容。", 400);
    }

    const { bookBinding } = await this.findBindings(novelId);
    if (!bookBinding) {
      return this.getBookFeedback(novelId);
    }

    const existingLanguageRules = parseJsonObject<Record<string, unknown>>(bookBinding.styleProfile.languageRulesJson);
    const existingPairs = readContrastPairsFromJson(bookBinding.styleProfile.languageRulesJson);
    const contrastPairs = existingPairs.filter((item) => item.aiPattern !== targetPattern);

    await prisma.styleProfile.update({
      where: { id: bookBinding.styleProfile.id },
      data: {
        languageRulesJson: serializeJson({
          ...existingLanguageRules,
          contrastPairs,
        }),
      },
    });

    return {
      profileId: bookBinding.styleProfile.id,
      profileName: bookBinding.styleProfile.name,
      isBookOwned: true,
      contrastPairs,
    };
  }

  private async findBindings(novelId: string) {
    const bindings = await prisma.styleBinding.findMany({
      where: {
        targetType: "novel",
        targetId: novelId,
        enabled: true,
      },
      include: {
        styleProfile: {
          include: {
            antiAiBindings: {
              where: { enabled: true },
            },
          },
        },
      },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    });

    const bookBinding = bindings.find(
      (item) => item.styleProfile.sourceType === BOOK_FEEDBACK_SOURCE_TYPE && item.styleProfile.sourceRefId === novelId,
    ) ?? null;
    const fallbackBinding = bindings.find((item) => item.id !== bookBinding?.id) ?? null;

    return { bookBinding, fallbackBinding };
  }
}

export const novelHumanStyleFeedbackService = new NovelHumanStyleFeedbackService();
