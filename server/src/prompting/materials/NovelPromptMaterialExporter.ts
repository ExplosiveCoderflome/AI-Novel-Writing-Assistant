import { prisma } from "../../db/prisma";
import { estimateContextTokens } from "../context/ContextBroker";
import { listNovelMaterialGroupDefinitions, resolveNovelMaterialGroup } from "./materialGroups";
import type {
  NovelMaterialBlock,
  NovelMaterialExportInput,
  NovelMaterialExportResult,
  NovelMaterialGroupDefinition,
  NovelMaterialImportance,
  NovelMaterialSourceType,
} from "./types";

type MaterialsDb = typeof prisma;

const DEFAULT_MATERIAL_GROUPS = listNovelMaterialGroupDefinitions().map((definition) => definition.group);
const DEFAULT_RECENT_CHAPTER_LIMIT = 3;
const DEFAULT_MAX_TOKENS = 12000;

function compactLines(lines: Array<string | null | undefined | false>): string {
  return lines
    .filter((line): line is string => typeof line === "string" && line.trim().length > 0)
    .join("\n");
}

function formatDate(value: Date | string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function truncateText(value: string | null | undefined, maxChars: number): string {
  const text = value?.trim() ?? "";
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 20)).trimEnd()}\n...[已裁剪]`;
}

function jsonArrayPreview(value: string | null | undefined, fallback = "无"): string {
  if (!value?.trim()) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => `- ${String(item)}`).join("\n") || fallback;
    }
    if (parsed && typeof parsed === "object") {
      return JSON.stringify(parsed, null, 2);
    }
  } catch {
    return value;
  }
  return value;
}

function block(input: {
  group: string;
  title: string;
  content: string;
  required: boolean;
  importance: NovelMaterialImportance;
  sourceType: NovelMaterialSourceType;
  sourceId?: string;
  updatedAt?: Date | string | null;
}): NovelMaterialBlock | null {
  const content = input.content.trim();
  if (!content) {
    return null;
  }
  return {
    id: `${input.group}:${input.sourceId ?? "main"}`,
    group: input.group,
    title: input.title,
    content,
    required: input.required,
    importance: input.importance,
    source: {
      type: input.sourceType,
      id: input.sourceId,
      updatedAt: formatDate(input.updatedAt),
    },
    estimatedTokens: estimateContextTokens(content),
  };
}

function dedupe(input: string[]): string[] {
  return [...new Set(input.filter((item) => item.trim().length > 0))];
}

function sortRequestedGroups(groups?: string[]): string[] {
  const requested = groups?.map((group) => group.trim()).filter(Boolean);
  if (!requested || requested.length === 0) {
    return DEFAULT_MATERIAL_GROUPS;
  }
  return dedupe(requested);
}

export class NovelPromptMaterialExporter {
  constructor(private readonly db: MaterialsDb = prisma) {}

  async export(input: NovelMaterialExportInput): Promise<NovelMaterialExportResult> {
    const novelId = input.novelId?.trim();
    if (!novelId) {
      throw new Error("novelId is required to export prompt materials.");
    }

    const requestedGroups = sortRequestedGroups(input.groups);
    const missingGroups: string[] = [];
    const missingInputs: string[] = [];
    const warnings: string[] = [];
    const blocks: NovelMaterialBlock[] = [];

    for (const requestedGroup of requestedGroups) {
      const definition = resolveNovelMaterialGroup(requestedGroup);
      if (!definition) {
        missingGroups.push(requestedGroup);
        continue;
      }
      if (definition.requiresChapterId && !input.chapterId?.trim()) {
        missingInputs.push(`${requestedGroup}: chapterId`);
        continue;
      }
      if (definition.requiresTaskId && !input.taskId?.trim()) {
        missingInputs.push(`${requestedGroup}: taskId`);
        continue;
      }

      const exported = await this.resolveGroup({
        requestedGroup,
        definition,
        input: {
          ...input,
          novelId,
          chapterId: input.chapterId?.trim(),
          taskId: input.taskId?.trim(),
          volumeId: input.volumeId?.trim(),
        },
      });
      if (!exported) {
        missingGroups.push(requestedGroup);
        continue;
      }
      blocks.push(exported);
    }

    const limited = applyTokenLimit({
      blocks,
      maxTokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
      warnings,
    });

    return {
      blocks: limited,
      missingGroups: dedupe(missingGroups),
      missingInputs: dedupe(missingInputs),
      warnings,
      generatedAt: new Date().toISOString(),
    };
  }

  private async resolveGroup(input: {
    requestedGroup: string;
    definition: NovelMaterialGroupDefinition;
    input: NovelMaterialExportInput;
  }): Promise<NovelMaterialBlock | null> {
    switch (input.definition.group) {
      case "novel_basics":
        return this.buildNovelBasics(input.requestedGroup, input.definition, input.input.novelId);
      case "book_contract":
        return this.buildBookContract(input.requestedGroup, input.definition, input.input.novelId);
      case "chapter_mission":
        return this.buildChapterMission(input.requestedGroup, input.definition, input.input.novelId, input.input.chapterId);
      case "current_chapter":
        return this.buildCurrentChapter(input.requestedGroup, input.definition, input.input.novelId, input.input.chapterId);
      case "recent_chapters":
        return this.buildRecentChapters(input.requestedGroup, input.definition, input.input.novelId, input.input.chapterId);
      case "character_state":
        return this.buildCharacterState(input.requestedGroup, input.definition, input.input.novelId);
      case "world_rules":
        return this.buildWorldRules(input.requestedGroup, input.definition, input.input.novelId);
      case "style_contract":
        return this.buildStyleContract(input.requestedGroup, input.definition, input.input.novelId, input.input.chapterId);
      case "open_issues":
        return this.buildOpenIssues(input.requestedGroup, input.definition, input.input.novelId, input.input.chapterId);
      case "director_workspace":
        return this.buildDirectorWorkspace(input.requestedGroup, input.definition, input.input.novelId, input.input.taskId);
      default:
        return null;
    }
  }

  private async buildNovelBasics(group: string, definition: NovelMaterialGroupDefinition, novelId: string) {
    const novel = await this.db.novel.findUnique({
      where: { id: novelId },
      include: { genre: true, primaryStoryMode: true, secondaryStoryMode: true },
    });
    if (!novel) {
      return null;
    }
    return block({
      group,
      title: definition.title,
      required: definition.required,
      importance: definition.importance,
      sourceType: definition.sourceType,
      sourceId: novel.id,
      updatedAt: novel.updatedAt,
      content: compactLines([
        `书名：${novel.title}`,
        novel.description ? `简介：${novel.description}` : null,
        novel.genre?.name ? `题材：${novel.genre.name}` : null,
        novel.targetAudience ? `目标读者：${novel.targetAudience}` : null,
        novel.bookSellingPoint ? `核心卖点：${novel.bookSellingPoint}` : null,
        novel.first30ChapterPromise ? `前 30 章承诺：${novel.first30ChapterPromise}` : null,
        novel.estimatedChapterCount ? `预计章节数：${novel.estimatedChapterCount}` : null,
        novel.defaultChapterLength ? `默认章节长度：${novel.defaultChapterLength}` : null,
        novel.primaryStoryMode?.name ? `主推进模式：${novel.primaryStoryMode.name}` : null,
        novel.secondaryStoryMode?.name ? `辅助推进模式：${novel.secondaryStoryMode.name}` : null,
      ]),
    });
  }

  private async buildBookContract(group: string, definition: NovelMaterialGroupDefinition, novelId: string) {
    const novel = await this.db.novel.findUnique({
      where: { id: novelId },
      include: { bookContract: true, storyMacroPlan: true },
    });
    if (!novel) {
      return null;
    }
    const contract = novel.bookContract;
    return block({
      group,
      title: definition.title,
      required: definition.required,
      importance: definition.importance,
      sourceType: definition.sourceType,
      sourceId: contract?.id ?? novel.storyMacroPlan?.id ?? novel.id,
      updatedAt: contract?.updatedAt ?? novel.storyMacroPlan?.updatedAt ?? novel.updatedAt,
      content: compactLines([
        contract?.readingPromise ? `读者承诺：${contract.readingPromise}` : null,
        contract?.coreSellingPoint ? `核心卖点：${contract.coreSellingPoint}` : null,
        contract?.protagonistFantasy ? `主角爽点：${contract.protagonistFantasy}` : null,
        contract?.relationshipMainline ? `关系主线：${contract.relationshipMainline}` : null,
        contract?.escalationLadder ? `升级阶梯：${contract.escalationLadder}` : null,
        contract?.chapter3Payoff ? `第 3 章回报：${contract.chapter3Payoff}` : null,
        contract?.chapter10Payoff ? `第 10 章回报：${contract.chapter10Payoff}` : null,
        contract?.chapter30Payoff ? `第 30 章回报：${contract.chapter30Payoff}` : null,
        contract?.absoluteRedLinesJson ? `绝对红线：\n${jsonArrayPreview(contract.absoluteRedLinesJson)}` : null,
        novel.storyMacroPlan?.storyInput ? `故事输入：${novel.storyMacroPlan.storyInput}` : null,
        novel.storyMacroPlan?.decompositionJson
          ? `宏观拆解：\n${truncateText(novel.storyMacroPlan.decompositionJson, 1800)}`
          : null,
      ]),
    });
  }

  private async buildChapterMission(
    group: string,
    definition: NovelMaterialGroupDefinition,
    novelId: string,
    chapterId?: string,
  ) {
    const chapter = await this.findChapter(novelId, chapterId);
    if (!chapter) {
      return null;
    }
    return block({
      group,
      title: definition.title,
      required: definition.required,
      importance: definition.importance,
      sourceType: definition.sourceType,
      sourceId: chapter.id,
      updatedAt: chapter.updatedAt,
      content: compactLines([
        `章节：第 ${chapter.order} 章《${chapter.title}》`,
        chapter.expectation ? `章节目标：${chapter.expectation}` : null,
        chapter.taskSheet ? `任务单：\n${truncateText(chapter.taskSheet, 2200)}` : null,
        chapter.sceneCards ? `场景卡：\n${truncateText(chapter.sceneCards, 1800)}` : null,
        chapter.targetWordCount ? `目标字数：${chapter.targetWordCount}` : null,
        chapter.mustAvoid ? `必须避免：${chapter.mustAvoid}` : null,
        chapter.hook ? `章节钩子：${chapter.hook}` : null,
      ]),
    });
  }

  private async buildCurrentChapter(
    group: string,
    definition: NovelMaterialGroupDefinition,
    novelId: string,
    chapterId?: string,
  ) {
    const chapter = await this.findChapter(novelId, chapterId, { includeSummary: true });
    if (!chapter) {
      return null;
    }
    const summary = (chapter as typeof chapter & {
      chapterSummary?: {
        summary?: string | null;
        keyEvents?: string | null;
        characterStates?: string | null;
      } | null;
    }).chapterSummary;
    return block({
      group,
      title: definition.title,
      required: definition.required,
      importance: definition.importance,
      sourceType: definition.sourceType,
      sourceId: chapter.id,
      updatedAt: chapter.updatedAt,
      content: compactLines([
        `章节：第 ${chapter.order} 章《${chapter.title}》`,
        `正文状态：${chapter.content?.trim() ? "已有正文" : "暂无正文"}`,
        chapter.targetWordCount ? `目标字数：${chapter.targetWordCount}` : null,
        summary?.summary ? `章节摘要：${summary.summary}` : null,
        summary?.keyEvents ? `关键事件：${summary.keyEvents}` : null,
        summary?.characterStates ? `角色状态：${summary.characterStates}` : null,
        chapter.content ? `正文片段：\n${truncateText(chapter.content, 2600)}` : null,
      ]),
    });
  }

  private async buildRecentChapters(
    group: string,
    definition: NovelMaterialGroupDefinition,
    novelId: string,
    chapterId?: string,
  ) {
    const chapter = await this.findChapter(novelId, chapterId);
    if (!chapter) {
      return null;
    }
    const recent = await this.db.chapter.findMany({
      where: {
        novelId,
        order: { lt: chapter.order },
      },
      orderBy: { order: "desc" },
      take: DEFAULT_RECENT_CHAPTER_LIMIT,
      include: { chapterSummary: true },
    });
    if (recent.length === 0) {
      return null;
    }
    const rows = recent.reverse().map((item) => compactLines([
      `第 ${item.order} 章《${item.title}》`,
      item.chapterSummary?.summary ? `摘要：${item.chapterSummary.summary}` : null,
      item.chapterSummary?.keyEvents ? `关键事件：${item.chapterSummary.keyEvents}` : null,
      !item.chapterSummary?.summary && item.content ? `正文片段：${truncateText(item.content, 500)}` : null,
    ]));
    return block({
      group,
      title: definition.title,
      required: definition.required,
      importance: definition.importance,
      sourceType: definition.sourceType,
      sourceId: chapter.id,
      updatedAt: chapter.updatedAt,
      content: rows.join("\n\n"),
    });
  }

  private async buildCharacterState(group: string, definition: NovelMaterialGroupDefinition, novelId: string) {
    const [characters, resources] = await Promise.all([
      this.db.character.findMany({
        where: { novelId },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
      this.db.characterResourceLedgerItem.findMany({
        where: { novelId },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
    ]);
    if (characters.length === 0 && resources.length === 0) {
      return null;
    }
    return block({
      group,
      title: definition.title,
      required: definition.required,
      importance: definition.importance,
      sourceType: definition.sourceType,
      sourceId: novelId,
      content: compactLines([
        characters.length > 0
          ? `角色：\n${characters.map((character) => compactLines([
            `- ${character.name}${character.role ? `（${character.role}）` : ""}`,
            character.currentState ? `  当前状态：${character.currentState}` : null,
            character.currentGoal ? `  当前目标：${character.currentGoal}` : null,
            character.development ? `  成长线：${truncateText(character.development, 180)}` : null,
          ])).join("\n")}`
          : null,
        resources.length > 0
          ? `资源：\n${resources.map((item) => `- ${item.name}：${item.status}；${item.summary}`).join("\n")}`
          : null,
      ]),
    });
  }

  private async buildWorldRules(group: string, definition: NovelMaterialGroupDefinition, novelId: string) {
    const novel = await this.db.novel.findUnique({
      where: { id: novelId },
      include: { world: true },
    });
    const world = novel?.world;
    if (!world) {
      return null;
    }
    return block({
      group,
      title: definition.title,
      required: definition.required,
      importance: definition.importance,
      sourceType: definition.sourceType,
      sourceId: world.id,
      updatedAt: world.updatedAt,
      content: compactLines([
        `世界观：${world.name}`,
        world.description ? `简介：${world.description}` : null,
        world.axioms ? `硬规则：${world.axioms}` : null,
        world.background ? `背景：${truncateText(world.background, 900)}` : null,
        world.magicSystem ? `能力/魔法体系：${truncateText(world.magicSystem, 900)}` : null,
        world.politics ? `政治/秩序：${truncateText(world.politics, 700)}` : null,
        world.factions ? `势力：${truncateText(world.factions, 700)}` : null,
        world.conflicts ? `核心冲突：${truncateText(world.conflicts, 700)}` : null,
      ]),
    });
  }

  private async buildStyleContract(
    group: string,
    definition: NovelMaterialGroupDefinition,
    novelId: string,
    chapterId?: string,
  ) {
    const bindings = await this.db.styleBinding.findMany({
      where: {
        enabled: true,
        OR: [
          { targetType: "novel", targetId: novelId },
          ...(chapterId ? [{ targetType: "chapter" as const, targetId: chapterId }] : []),
        ],
      },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: 3,
      include: {
        styleProfile: {
          include: {
            antiAiBindings: {
              where: { enabled: true },
              include: { antiAiRule: true },
              take: 8,
            },
          },
        },
      },
    });
    if (bindings.length === 0) {
      return null;
    }
    const rows = bindings.map((binding) => {
      const profile = binding.styleProfile;
      const antiAiRules = profile.antiAiBindings
        .map((item) => item.antiAiRule.promptInstruction || item.antiAiRule.description)
        .filter(Boolean)
        .slice(0, 6);
      return compactLines([
        `写法资产：${profile.name}`,
        profile.description ? `说明：${profile.description}` : null,
        profile.narrativeRulesJson ? `叙事规则：${jsonArrayPreview(profile.narrativeRulesJson)}` : null,
        profile.languageRulesJson ? `语言规则：${jsonArrayPreview(profile.languageRulesJson)}` : null,
        antiAiRules.length > 0 ? `反 AI 味规则：\n${antiAiRules.map((item) => `- ${item}`).join("\n")}` : null,
      ]);
    });
    return block({
      group,
      title: definition.title,
      required: definition.required,
      importance: definition.importance,
      sourceType: definition.sourceType,
      sourceId: bindings[0]?.styleProfileId,
      updatedAt: bindings[0]?.updatedAt,
      content: rows.join("\n\n"),
    });
  }

  private async buildOpenIssues(
    group: string,
    definition: NovelMaterialGroupDefinition,
    novelId: string,
    chapterId?: string,
  ) {
    const [reports, conflicts] = await Promise.all([
      this.db.auditReport.findMany({
        where: { novelId, chapterId },
        orderBy: { createdAt: "desc" },
        take: 3,
        include: {
          issues: {
            where: { status: "open" },
            orderBy: { createdAt: "desc" },
            take: 8,
          },
        },
      }),
      this.db.openConflict.findMany({
        where: { novelId, status: "open" },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
    ]);
    const issues = reports.flatMap((report) => report.issues);
    if (issues.length === 0 && conflicts.length === 0) {
      return null;
    }
    return block({
      group,
      title: definition.title,
      required: definition.required,
      importance: definition.importance,
      sourceType: definition.sourceType,
      sourceId: chapterId,
      content: compactLines([
        issues.length > 0
          ? `审校问题：\n${issues.map((issue) => `- [${issue.severity}/${issue.code}] ${issue.evidence}；建议：${issue.fixSuggestion}`).join("\n")}`
          : null,
        conflicts.length > 0
          ? `开放冲突：\n${conflicts.map((conflict) => `- [${conflict.severity}] ${conflict.title}：${conflict.summary}`).join("\n")}`
          : null,
      ]),
    });
  }

  private async buildDirectorWorkspace(
    group: string,
    definition: NovelMaterialGroupDefinition,
    novelId: string,
    taskId?: string,
  ) {
    const task = taskId
      ? await this.db.novelWorkflowTask.findUnique({ where: { id: taskId } })
      : await this.db.novelWorkflowTask.findFirst({
        where: { novelId },
        orderBy: { updatedAt: "desc" },
      });
    if (!task) {
      return null;
    }
    return block({
      group,
      title: definition.title,
      required: definition.required,
      importance: definition.importance,
      sourceType: definition.sourceType,
      sourceId: task.id,
      updatedAt: task.updatedAt,
      content: compactLines([
        `任务：${task.title}`,
        `状态：${task.status}`,
        `进度：${Math.round(task.progress * 100)}%`,
        task.currentStage ? `当前阶段：${task.currentStage}` : null,
        task.currentItemLabel ? `当前事项：${task.currentItemLabel}` : null,
        task.checkpointSummary ? `检查点：${task.checkpointSummary}` : null,
        task.lastError ? `最近错误：${task.lastError}` : null,
      ]),
    });
  }

  private async findChapter(
    novelId: string,
    chapterId?: string,
    options: { includeSummary?: boolean } = {},
  ) {
    if (!chapterId) {
      return null;
    }
    return this.db.chapter.findFirst({
      where: { id: chapterId, novelId },
      include: options.includeSummary ? { chapterSummary: true } : undefined,
    });
  }
}

function applyTokenLimit(input: {
  blocks: NovelMaterialBlock[];
  maxTokens: number;
  warnings: string[];
}): NovelMaterialBlock[] {
  const maxTokens = Math.max(0, input.maxTokens);
  const total = input.blocks.reduce((sum, item) => sum + item.estimatedTokens, 0);
  if (maxTokens === 0 || total <= maxTokens) {
    return input.blocks;
  }

  let remaining = maxTokens;
  const limited: NovelMaterialBlock[] = [];
  for (const item of input.blocks) {
    if (remaining <= 0) {
      input.warnings.push(`${item.title} 未进入导出结果：超过本次资料预算。`);
      continue;
    }
    if (item.estimatedTokens <= remaining) {
      limited.push(item);
      remaining -= item.estimatedTokens;
      continue;
    }
    const allowedChars = Math.max(60, remaining * 3);
    const content = truncateText(item.content, allowedChars);
    input.warnings.push(`${item.title} 已裁剪：超过本次资料预算。`);
    limited.push({
      ...item,
      content,
      estimatedTokens: estimateContextTokens(content),
    });
    remaining = 0;
  }
  return limited;
}

export const novelPromptMaterialExporter = new NovelPromptMaterialExporter();

export async function exportNovelPromptMaterials(input: NovelMaterialExportInput): Promise<NovelMaterialExportResult> {
  return novelPromptMaterialExporter.export(input);
}
