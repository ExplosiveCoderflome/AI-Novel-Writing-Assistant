import { NOVEL_EXPORT_SCOPE_LABELS, type NovelExportScope } from "@ai-novel/shared/types/novelExport";
import type {
  NovelExportBasicSection,
  NovelExportBundle,
  NovelExportCharacterSection,
  NovelExportChapterSection,
  NovelExportOutlineSection,
  NovelExportPipelineSection,
  NovelExportSectionMap,
  NovelExportSectionScope,
  NovelExportStoryMacroSection,
  NovelExportStructuredSection,
} from "./novelExportTypes";

const FULL_SECTION_ORDER: NovelExportSectionScope[] = [
  "basic",
  "story_macro",
  "character",
  "outline",
  "structured",
  "chapter",
  "pipeline",
];

function normalizeText(input: string | null | undefined): string {
  return (input ?? "").replace(/\r\n?/g, "\n").trim();
}

function hasMeaningfulText(input: string | null | undefined): boolean {
  return normalizeText(input).length > 0;
}

function addBullet(lines: string[], label: string, value: string | number | null | undefined): void {
  if (value === null || value === undefined) {
    return;
  }
  const text = typeof value === "number" ? String(value) : normalizeText(value);
  if (!text) {
    return;
  }
  lines.push(`- ${label}：${text}`);
}

function addParagraph(lines: string[], title: string, value: string | null | undefined, level = 3): void {
  const text = normalizeText(value);
  if (!text) {
    return;
  }
  lines.push(`${"#".repeat(level)} ${title}`);
  lines.push("");
  lines.push(text);
  lines.push("");
}

function addJsonBlock(lines: string[], title: string, value: unknown): void {
  lines.push(`### ${title}`);
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(value, null, 2));
  lines.push("```");
  lines.push("");
}

function buildBasicSummary(section: NovelExportBasicSection): string[] {
  const lines: string[] = [];
  addBullet(lines, "标题", section.novel.title);
  addBullet(lines, "写作模式", section.novel.writingMode);
  addBullet(lines, "项目模式", section.novel.projectMode ?? null);
  addBullet(lines, "题材", section.novel.genre?.name ?? null);
  addBullet(lines, "主流派", section.novel.primaryStoryMode?.name ?? null);
  addBullet(lines, "副流派", section.novel.secondaryStoryMode?.name ?? null);
  addBullet(lines, "绑定世界", section.novel.world?.name ?? null);
  addBullet(lines, "预计章节数", section.novel.estimatedChapterCount ?? null);
  if ((section.novel.commercialTags ?? []).length > 0) {
    addBullet(lines, "商业标签", section.novel.commercialTags.join(" / "));
  }
  addParagraph(lines, "一句话简介", section.novel.description);
  addParagraph(lines, "目标读者", section.novel.targetAudience);
  addParagraph(lines, "核心卖点", section.novel.bookSellingPoint);
  addParagraph(lines, "对标感受", section.novel.competingFeel);
  addParagraph(lines, "前 30 章承诺", section.novel.first30ChapterPromise);
  addParagraph(lines, "世界切片核心框架", section.worldSlice?.slice?.coreWorldFrame ?? null);
  return lines;
}

function buildStoryMacroSummary(section: NovelExportStoryMacroSection): string[] {
  const lines: string[] = [];
  addParagraph(lines, "故事输入", section.storyMacroPlan?.storyInput);
  addParagraph(lines, "展开前提", section.storyMacroPlan?.expansion?.expanded_premise ?? null);
  addParagraph(lines, "主角核心", section.storyMacroPlan?.expansion?.protagonist_core ?? null);
  addParagraph(lines, "冲突引擎", section.storyMacroPlan?.expansion?.conflict_engine ?? null);
  addParagraph(lines, "核心冲突", section.storyMacroPlan?.decomposition?.core_conflict ?? null);
  addParagraph(lines, "主钩子", section.storyMacroPlan?.decomposition?.main_hook ?? null);
  addParagraph(lines, "推进循环", section.storyMacroPlan?.decomposition?.progression_loop ?? null);
  addParagraph(lines, "书级阅读承诺", section.bookContract?.readingPromise ?? null);
  addParagraph(lines, "核心售卖点", section.bookContract?.coreSellingPoint ?? null);
  addParagraph(lines, "升级阶梯", section.bookContract?.escalationLadder ?? null);
  if ((section.bookContract?.absoluteRedLines ?? []).length > 0) {
    lines.push("### 绝对红线");
    lines.push("");
    for (const item of section.bookContract?.absoluteRedLines ?? []) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }
  return lines;
}

function buildCharacterSummary(section: NovelExportCharacterSection): string[] {
  const lines: string[] = [];
  addBullet(lines, "角色数", section.characters.length);
  addBullet(lines, "关系数", section.relations.length);
  addBullet(lines, "候选阵容数", section.castOptions.length);
  if (section.characters.length > 0) {
    lines.push("### 当前角色");
    lines.push("");
    for (const character of section.characters) {
      const parts = [character.name, character.role, character.castRole].filter((item): item is string => Boolean(item?.trim()));
      lines.push(`- ${parts.join(" / ")}`);
    }
    lines.push("");
  }
  return lines;
}

function buildOutlineSummary(section: NovelExportOutlineSection): string[] {
  const lines: string[] = [];
  addBullet(lines, "卷来源", section.workspace?.source ?? null);
  addBullet(lines, "卷数", section.workspace?.volumes.length ?? 0);
  addBullet(lines, "推荐卷数", section.workspace?.strategyPlan?.recommendedVolumeCount ?? null);
  addParagraph(lines, "卷级导出大纲", section.workspace?.derivedOutline ?? null);
  addParagraph(lines, "读者奖励阶梯", section.workspace?.strategyPlan?.readerRewardLadder ?? null);
  addParagraph(lines, "升级阶梯", section.workspace?.strategyPlan?.escalationLadder ?? null);
  addParagraph(lines, "策略备注", section.workspace?.strategyPlan?.notes ?? null);
  addParagraph(lines, "批判总结", section.workspace?.critiqueReport?.summary ?? null);
  return lines;
}

function buildStructuredSummary(section: NovelExportStructuredSection): string[] {
  const lines: string[] = [];
  const beatCount = (section.workspace?.beatSheets ?? []).reduce((sum, item) => sum + item.beats.length, 0);
  const chapterCount = (section.workspace?.volumes ?? []).reduce((sum, item) => sum + item.chapters.length, 0);
  addBullet(lines, "节拍卡数量", beatCount);
  addBullet(lines, "章节规划数", chapterCount);
  addBullet(lines, "重平衡决策数", section.workspace?.rebalanceDecisions.length ?? 0);
  addParagraph(lines, "结构化大纲", section.workspace?.derivedStructuredOutline ?? null);
  return lines;
}

function buildChapterSummary(section: NovelExportChapterSection): string[] {
  const lines: string[] = [];
  const generatedCount = section.chapters.filter((chapter) => hasMeaningfulText(chapter.content)).length;
  addBullet(lines, "章节总数", section.chapters.length);
  addBullet(lines, "已有正文章节", generatedCount);
  addBullet(lines, "章节计划数", section.chapterPlans.length);
  if (section.chapters.length > 0) {
    lines.push("### 章节列表");
    lines.push("");
    for (const chapter of section.chapters) {
      lines.push(`- 第 ${chapter.order} 章：${chapter.title}`);
    }
    lines.push("");
  }
  return lines;
}

function buildPipelineSummary(section: NovelExportPipelineSection): string[] {
  const lines: string[] = [];
  addBullet(lines, "总体质量分", section.qualityReport.summary.overall);
  addBullet(lines, "质量报告数", section.qualityReport.totalReports ?? section.qualityReport.chapterReports.length);
  addBullet(lines, "审计报告数", section.chapterAuditReports.length);
  addBullet(lines, "情节点数", section.plotBeats.length);
  addBullet(lines, "伏笔账本项数", section.payoffLedger?.items.length ?? 0);
  addBullet(lines, "最近流水线状态", section.latestPipelineJob?.status ?? null);
  addParagraph(lines, "小说圣经原始内容", section.bible?.rawContent ?? null);
  return lines;
}

function buildSectionSummary(scope: NovelExportSectionScope, section: NovelExportSectionMap[NovelExportSectionScope]): string[] {
  switch (scope) {
    case "basic":
      return buildBasicSummary(section as NovelExportBasicSection);
    case "story_macro":
      return buildStoryMacroSummary(section as NovelExportStoryMacroSection);
    case "character":
      return buildCharacterSummary(section as NovelExportCharacterSection);
    case "outline":
      return buildOutlineSummary(section as NovelExportOutlineSection);
    case "structured":
      return buildStructuredSummary(section as NovelExportStructuredSection);
    case "chapter":
      return buildChapterSummary(section as NovelExportChapterSection);
    case "pipeline":
      return buildPipelineSummary(section as NovelExportPipelineSection);
    default:
      return [];
  }
}

export function buildScopedNovelExportPayload(
  bundle: NovelExportBundle,
  scope: NovelExportScope,
): {
  metadata: NovelExportBundle["metadata"] & {
    scope: NovelExportScope;
    scopeLabel: string;
  };
  data: NovelExportSectionMap | NovelExportSectionMap[NovelExportSectionScope];
} {
  return {
    metadata: {
      ...bundle.metadata,
      scope,
      scopeLabel: NOVEL_EXPORT_SCOPE_LABELS[scope],
    },
    data: scope === "full" ? bundle.sections : bundle.sections[scope],
  };
}

export function buildMarkdownExportContent(bundle: NovelExportBundle, scope: NovelExportScope): string {
  const lines: string[] = [];
  const scopeLabel = NOVEL_EXPORT_SCOPE_LABELS[scope];
  const sectionScopes = scope === "full" ? FULL_SECTION_ORDER : [scope];

  lines.push(`# ${bundle.metadata.novelTitle} 导出`);
  lines.push("");
  lines.push(`- 导出范围：${scopeLabel}`);
  lines.push(`- 导出时间：${bundle.metadata.exportedAt}`);
  lines.push(`- 小说 ID：${bundle.metadata.novelId}`);
  lines.push("");

  for (const sectionScope of sectionScopes) {
    const section = bundle.sections[sectionScope];
    lines.push(`## ${NOVEL_EXPORT_SCOPE_LABELS[sectionScope]}`);
    lines.push("");
    const summaryLines = buildSectionSummary(sectionScope, section);
    if (summaryLines.length > 0) {
      lines.push(...summaryLines);
    } else {
      lines.push("（当前没有可总结的结构化内容）");
      lines.push("");
    }
    addJsonBlock(lines, "完整数据", section);
  }

  return lines.join("\n");
}
