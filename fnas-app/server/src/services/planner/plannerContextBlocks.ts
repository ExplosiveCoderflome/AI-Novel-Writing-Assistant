import { createContextBlock } from "../../prompting/core/contextBudget";
import type { PromptContextBlock } from "../../prompting/core/promptTypes";

function buildBlockContent(label: string, value: string): string {
  return `${label}：${value.trim() || "无"}`;
}

function buildVolumeOutline(input: Array<{
  sortOrder: number;
  title: string;
  summary: string | null;
  mainPromise: string | null;
  climax: string | null;
  chapters: Array<{
    chapterOrder: number;
    title: string;
    summary: string | null;
  }>;
}>): string {
  if (input.length === 0) {
    return "";
  }
  return input
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((volume) => {
      const chapterSpan = volume.chapters.length > 0
        ? `${volume.chapters[0]?.chapterOrder ?? "-"}-${volume.chapters[volume.chapters.length - 1]?.chapterOrder ?? "-"}`
        : "未拆章";
      return [
        `【第${volume.sortOrder}卷】${volume.title}`,
        volume.summary ? `卷摘要：${volume.summary}` : "",
        volume.mainPromise ? `主承诺：${volume.mainPromise}` : "",
        volume.climax ? `卷末高潮：${volume.climax}` : "",
        `章节范围：${chapterSpan}`,
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");
}

function buildBookFramingText(input: {
  targetAudience: string | null;
  bookSellingPoint: string | null;
  competingFeel: string | null;
  first30ChapterPromise: string | null;
  narrativePov?: string | null;
  pacePreference?: string | null;
  emotionIntensity?: string | null;
  styleTone?: string | null;
}): string {
  return [
    buildBlockContent("目标读者", input.targetAudience ?? "无"),
    buildBlockContent("核心卖点", input.bookSellingPoint ?? "无"),
    buildBlockContent("竞品/对标感受", input.competingFeel ?? "无"),
    buildBlockContent("前30章承诺", input.first30ChapterPromise ?? "无"),
    buildBlockContent("叙事视角", input.narrativePov ?? "无"),
    buildBlockContent("节奏偏好", input.pacePreference ?? "无"),
    buildBlockContent("情绪强度", input.emotionIntensity ?? "无"),
    buildBlockContent("语气护栏", input.styleTone ?? "无"),
  ].join("\n");
}

export function buildBookPlanContextBlocks(input: {
  novelTitle: string;
  description: string | null;
  bible: string | null;
  chapterDrafts: string;
  plotBeats: string;
  storyModeBlock: string;
}): PromptContextBlock[] {
  return [
    createContextBlock({
      id: "story_mode",
      group: "story_mode",
      priority: 95,
      content: input.storyModeBlock || "故事模式：无",
    }),
    createContextBlock({
      id: "novel_overview",
      group: "novel_overview",
      priority: 100,
      required: true,
      content: [
        `小说：${input.novelTitle}`,
        buildBlockContent("简介", input.description ?? ""),
      ].join("\n"),
    }),
    createContextBlock({
      id: "book_bible",
      group: "book_bible",
      priority: 90,
      content: buildBlockContent("作品圣经", input.bible ?? "无"),
    }),
    createContextBlock({
      id: "chapter_drafts",
      group: "chapter_drafts",
      priority: 70,
      content: buildBlockContent("章节草稿", input.chapterDrafts || "无"),
    }),
    createContextBlock({
      id: "plot_beats",
      group: "plot_beats",
      priority: 60,
      content: buildBlockContent("剧情拍点", input.plotBeats || "无"),
    }),
  ];
}

export function buildArcPlanContextBlocks(input: {
  novelTitle: string;
  description: string | null;
  bible: string | null;
  chapters: string;
  storyModeBlock: string;
}): PromptContextBlock[] {
  return [
    createContextBlock({
      id: "story_mode",
      group: "story_mode",
      priority: 95,
      content: input.storyModeBlock || "故事模式：无",
    }),
    createContextBlock({
      id: "novel_overview",
      group: "novel_overview",
      priority: 100,
      required: true,
      content: [
        `小说：${input.novelTitle}`,
        buildBlockContent("简介", input.description ?? ""),
      ].join("\n"),
    }),
    createContextBlock({
      id: "book_bible",
      group: "book_bible",
      priority: 90,
      content: buildBlockContent("作品圣经", input.bible ?? "无"),
    }),
    createContextBlock({
      id: "chapter_drafts",
      group: "chapter_drafts",
      priority: 75,
      content: buildBlockContent("现有章节", input.chapters || "无"),
    }),
  ];
}

export function buildChapterPlanContextBlocks(input: {
  novelTitle: string;
  description: string | null;
  targetAudience: string | null;
  bookSellingPoint: string | null;
  competingFeel: string | null;
  first30ChapterPromise: string | null;
  narrativePov?: string | null;
  pacePreference?: string | null;
  emotionIntensity?: string | null;
  styleTone?: string | null;
  chapterExpectation: string | null;
  chapterTaskSheet: string | null;
  chapterTargetWordCount?: number | null;
  bible: string | null;
  outline: string | null;
  structuredOutline: string | null;
  mappedVolumes: Array<{
    sortOrder: number;
    title: string;
    summary: string | null;
    mainPromise: string | null;
    climax: string | null;
    updatedAt: string;
    chapters: Array<{
      chapterOrder: number;
      title: string;
      summary: string | null;
    }>;
  }>;
  bookPlan: string;
  arcPlans: string;
  characters: string;
  recentSummaries: string;
  plotBeats: string;
  stateSnapshot: string;
  openAuditIssues: string;
  recentDecisions: string;
  characterDynamicsSummary: string;
  characterVolumeAssignments: string;
  characterRelationStages: string;
  characterCandidateGuards: string;
  defaultMetadata: string;
  replanContext: string;
  storyMacroSummary: string;
  currentVolumeWindow: string;
  storyModeBlock: string;
}): PromptContextBlock[] {
  const volumeOutline = buildVolumeOutline(input.mappedVolumes);
  const volumeSummary = input.mappedVolumes.length > 0
    ? input.mappedVolumes.map((volume) => `${volume.sortOrder}. ${volume.title} | ${volume.mainPromise ?? volume.summary ?? "无"}${volume.climax ? ` | 高潮=${volume.climax}` : ""}`).join("\n")
    : "无";

  return [
    createContextBlock({
      id: "story_mode",
      group: "story_mode",
      priority: 95,
      content: input.storyModeBlock || "故事模式：无",
    }),
    createContextBlock({
      id: "novel_overview",
      group: "novel_overview",
      priority: 100,
      required: true,
      content: [
        `小说：${input.novelTitle}`,
        buildBlockContent("简介", input.description ?? ""),
      ].join("\n"),
    }),
    createContextBlock({
      id: "book_framing",
      group: "book_framing",
      priority: 99,
      content: buildBookFramingText({
        targetAudience: input.targetAudience,
        bookSellingPoint: input.bookSellingPoint,
        competingFeel: input.competingFeel,
        first30ChapterPromise: input.first30ChapterPromise,
        narrativePov: input.narrativePov,
        pacePreference: input.pacePreference,
        emotionIntensity: input.emotionIntensity,
        styleTone: input.styleTone,
      }),
    }),
    createContextBlock({
      id: "chapter_target",
      group: "chapter_target",
      priority: 100,
      required: true,
      content: [
        buildBlockContent("章节目标草稿", input.chapterExpectation ?? "无"),
        buildBlockContent("章节目标字数", typeof input.chapterTargetWordCount === "number" ? `${input.chapterTargetWordCount} 字` : "无"),
        buildBlockContent("任务单", input.chapterTaskSheet ?? "无"),
        buildBlockContent("默认结构职责建议", input.defaultMetadata),
      ].join("\n"),
    }),
    createContextBlock({
      id: "book_bible",
      group: "book_bible",
      priority: 92,
      content: buildBlockContent("作品圣经", input.bible ?? "无"),
    }),
    createContextBlock({
      id: "current_volume_window",
      group: "current_volume_window",
      priority: 97,
      content: buildBlockContent("当前卷窗口", input.currentVolumeWindow || "无"),
    }),
    createContextBlock({
      id: "story_macro",
      group: "story_macro",
      priority: 96,
      content: buildBlockContent("故事宏观约束", input.storyMacroSummary || "无"),
    }),
    createContextBlock({
      id: "volume_summary",
      group: "volume_summary",
      priority: 95,
      freshness: input.mappedVolumes.length > 0 ? 3 : 0,
      content: [
        buildBlockContent("卷级工作台摘要", volumeSummary),
        volumeOutline ? buildBlockContent("卷级工作台展开", volumeOutline) : "",
      ].filter(Boolean).join("\n"),
    }),
    createContextBlock({
      id: "legacy_outline_source",
      group: "legacy_outline_source",
      priority: 58,
      content: [
        buildBlockContent("兼容性旧主线大纲（仅作迁移参考）", input.outline ?? "无"),
        buildBlockContent("兼容性旧结构化大纲（仅作迁移参考）", input.structuredOutline ?? "无"),
      ].join("\n"),
    }),
    createContextBlock({
      id: "book_plan",
      group: "book_plan",
      priority: 88,
      content: buildBlockContent("全书规划", input.bookPlan),
    }),
    createContextBlock({
      id: "arc_plans",
      group: "arc_plans",
      priority: 82,
      content: buildBlockContent("阶段规划", input.arcPlans),
    }),
    createContextBlock({
      id: "character_digest",
      group: "character_digest",
      priority: 80,
      content: buildBlockContent("角色", input.characters),
    }),
    createContextBlock({
      id: "recent_summaries",
      group: "recent_summaries",
      priority: 72,
      content: buildBlockContent("最近章节摘要", input.recentSummaries),
    }),
    createContextBlock({
      id: "plot_beats",
      group: "plot_beats",
      priority: 68,
      content: buildBlockContent("剧情拍点", input.plotBeats),
    }),
    createContextBlock({
      id: "state_snapshot",
      group: "state_snapshot",
      priority: 98,
      required: true,
      content: buildBlockContent("输入状态快照", input.stateSnapshot),
    }),
    createContextBlock({
      id: "open_audit_issues",
      group: "open_audit_issues",
      priority: 86,
      content: buildBlockContent("最近未解决审计问题", input.openAuditIssues),
    }),
    createContextBlock({
      id: "recent_decisions",
      group: "recent_decisions",
      priority: 64,
      content: buildBlockContent("最近创作决策", input.recentDecisions),
    }),
    createContextBlock({
      id: "character_dynamics_summary",
      group: "character_dynamics",
      priority: 89,
      content: buildBlockContent("动态角色系统总览", input.characterDynamicsSummary),
    }),
    createContextBlock({
      id: "character_volume_assignments",
      group: "character_dynamics",
      priority: 88,
      content: buildBlockContent("当前卷角色职责与缺席风险", input.characterVolumeAssignments),
    }),
    createContextBlock({
      id: "character_relation_stages",
      group: "character_dynamics",
      priority: 87,
      content: buildBlockContent("当前关系阶段", input.characterRelationStages),
    }),
    createContextBlock({
      id: "character_candidate_guards",
      group: "character_dynamics",
      priority: 85,
      content: buildBlockContent("待确认候选角色保护", input.characterCandidateGuards),
    }),
    createContextBlock({
      id: "replan_context",
      group: "replan_context",
      priority: 84,
      content: buildBlockContent("重规划输入", input.replanContext),
    }),
  ];
}
