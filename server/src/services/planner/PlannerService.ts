import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { AuditReport } from "@ai-novel/shared/types/novel";
import { prisma } from "../../db/prisma";
import { getLLM } from "../../llm/factory";
import { parseJSONObject, parseJsonStringArray, toText } from "../novel/novelP0Utils";
import { stateService } from "../state/StateService";

interface PlannerOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

interface PlannerOutput {
  title?: string;
  objective?: string;
  participants?: string[];
  reveals?: string[];
  riskNotes?: string[];
  hookTarget?: string;
  scenes?: Array<{
    title?: string;
    objective?: string;
    conflict?: string;
    reveal?: string;
    emotionBeat?: string;
  }>;
}

interface ReplanInput extends PlannerOptions {
  chapterId?: string;
  triggerType?: string;
  reason: string;
}

function collectPlannerTextFragments(value: unknown): string[] {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? [normalized] : [];
  }
  if (typeof value === "number") {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectPlannerTextFragments(item));
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap((item) => collectPlannerTextFragments(item));
  }
  return [];
}

function toPlannerOptionalText(value: unknown, separator = "；"): string | null {
  const parts = Array.from(new Set(collectPlannerTextFragments(value)));
  return parts.length > 0 ? parts.join(separator) : null;
}

function toPlannerStringArray(value: unknown): string[] {
  return Array.from(new Set(collectPlannerTextFragments(value)));
}

function normalizePlannerScenes(value: unknown): NonNullable<PlannerOutput["scenes"]> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((scene, index) => {
    if (!scene || typeof scene !== "object") {
      return {
        title: toPlannerOptionalText(scene) ?? `Scene ${index + 1}`,
      };
    }
    const record = scene as Record<string, unknown>;
    return {
      title: toPlannerOptionalText(record.title) ?? `Scene ${index + 1}`,
      objective: toPlannerOptionalText(record.objective) ?? undefined,
      conflict: toPlannerOptionalText(record.conflict) ?? undefined,
      reveal: toPlannerOptionalText(record.reveal) ?? undefined,
      emotionBeat: toPlannerOptionalText(record.emotionBeat) ?? undefined,
    };
  });
}

export function normalizePlannerOutput(output: unknown): PlannerOutput {
  const record = output && typeof output === "object" ? output as Record<string, unknown> : {};
  return {
    title: toPlannerOptionalText(record.title) ?? undefined,
    objective: toPlannerOptionalText(record.objective) ?? undefined,
    participants: toPlannerStringArray(record.participants),
    reveals: toPlannerStringArray(record.reveals),
    riskNotes: toPlannerStringArray(record.riskNotes),
    hookTarget: toPlannerOptionalText(record.hookTarget) ?? undefined,
    scenes: normalizePlannerScenes(record.scenes),
  };
}

export class PlannerService {
  async getChapterPlan(novelId: string, chapterId: string) {
    return prisma.storyPlan.findFirst({
      where: { novelId, chapterId, level: "chapter" },
      include: {
        scenes: {
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  async buildPlanPromptBlock(novelId: string, chapterId: string): Promise<string> {
    const plan = await this.getChapterPlan(novelId, chapterId);
    if (!plan) {
      return "";
    }
    const participants = parseJsonStringArray(plan.participantsJson);
    const reveals = parseJsonStringArray(plan.revealsJson);
    const riskNotes = parseJsonStringArray(plan.riskNotesJson);
    const sceneLines = plan.scenes
      .map((scene) => `${scene.sortOrder}. ${scene.title}${scene.objective ? ` | 目标:${scene.objective}` : ""}${scene.conflict ? ` | 冲突:${scene.conflict}` : ""}${scene.reveal ? ` | 揭露:${scene.reveal}` : ""}${scene.emotionBeat ? ` | 情绪:${scene.emotionBeat}` : ""}`)
      .join("\n");
    return [
      `Plan title: ${plan.title}`,
      `Objective: ${plan.objective}`,
      participants.length > 0 ? `Participants: ${participants.join("、")}` : "",
      reveals.length > 0 ? `Key reveals: ${reveals.join("；")}` : "",
      riskNotes.length > 0 ? `Risk notes: ${riskNotes.join("；")}` : "",
      plan.hookTarget ? `Hook target: ${plan.hookTarget}` : "",
      sceneLines ? `Scenes:\n${sceneLines}` : "",
    ].filter(Boolean).join("\n");
  }

  async ensureChapterPlan(novelId: string, chapterId: string, options: PlannerOptions = {}) {
    const existing = await this.getChapterPlan(novelId, chapterId);
    if (existing && existing.scenes.length > 0) {
      return existing;
    }
    return this.generateChapterPlan(novelId, chapterId, options);
  }

  async generateBookPlan(novelId: string, options: PlannerOptions = {}) {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: {
        bible: true,
        chapters: { orderBy: { order: "asc" }, select: { title: true, order: true, expectation: true } },
        plotBeats: { orderBy: { chapterOrder: "asc" }, take: 8 },
      },
    });
    if (!novel) {
      throw new Error("小说不存在。");
    }
    const output = await this.invokePlanner({
      options,
      scopeLabel: `全书规划：${novel.title}`,
      context: [
        `简介：${novel.description ?? ""}`,
        `作品圣经：${novel.bible?.rawContent ?? "无"}`,
        `章节草稿：${novel.chapters.map((item) => `${item.order}.${item.title} ${item.expectation ?? ""}`).join("\n") || "无"}`,
        `剧情拍点：${novel.plotBeats.map((item) => `${item.chapterOrder ?? "-"} ${item.title} ${item.content}`).join("\n") || "无"}`,
      ].join("\n\n"),
      includeScenes: false,
    });
    return this.persistPlan({
      novelId,
      level: "book",
      title: output.title || `${novel.title} 全书规划`,
      objective: output.objective || "建立全书目标与主线推进。",
      participants: output.participants ?? [],
      reveals: output.reveals ?? [],
      riskNotes: output.riskNotes ?? [],
      hookTarget: output.hookTarget || null,
      scenes: [],
    });
  }

  async generateArcPlan(novelId: string, arcId: string, options: PlannerOptions = {}) {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: {
        bible: true,
        chapters: { orderBy: { order: "asc" }, select: { title: true, order: true, expectation: true } },
      },
    });
    if (!novel) {
      throw new Error("小说不存在。");
    }
    const output = await this.invokePlanner({
      options,
      scopeLabel: `分段规划：${arcId}`,
      context: [
        `小说：${novel.title}`,
        `简介：${novel.description ?? ""}`,
        `作品圣经：${novel.bible?.rawContent ?? "无"}`,
        `现有章节：${novel.chapters.map((item) => `${item.order}.${item.title} ${item.expectation ?? ""}`).join("\n") || "无"}`,
      ].join("\n\n"),
      includeScenes: false,
    });
    return this.persistPlan({
      novelId,
      level: "arc",
      externalRef: arcId,
      title: output.title || `Arc ${arcId}`,
      objective: output.objective || `围绕 ${arcId} 推进主线`,
      participants: output.participants ?? [],
      reveals: output.reveals ?? [],
      riskNotes: output.riskNotes ?? [],
      hookTarget: output.hookTarget || null,
      scenes: [],
    });
  }

  async generateChapterPlan(novelId: string, chapterId: string, options: PlannerOptions = {}) {
    const [novel, chapter, bible, plotBeats, summaries, characters] = await Promise.all([
      prisma.novel.findUnique({
        where: { id: novelId },
        select: { id: true, title: true, description: true, outline: true, structuredOutline: true },
      }),
      prisma.chapter.findFirst({
        where: { id: chapterId, novelId },
        select: {
          id: true,
          title: true,
          order: true,
          expectation: true,
          content: true,
          targetWordCount: true,
          conflictLevel: true,
          revealLevel: true,
          hook: true,
          taskSheet: true,
        },
      }),
      prisma.novelBible.findUnique({
        where: { novelId },
        select: { rawContent: true },
      }),
      prisma.plotBeat.findMany({
        where: { novelId },
        orderBy: { chapterOrder: "asc" },
        take: 8,
      }),
      prisma.chapterSummary.findMany({
        where: { novelId },
        orderBy: { createdAt: "desc" },
        take: 4,
      }),
      prisma.character.findMany({
        where: { novelId },
        select: { id: true, name: true, role: true, currentGoal: true, currentState: true },
      }),
    ]);
    if (!novel || !chapter) {
      throw new Error("小说或章节不存在。");
    }
    const stateSnapshot = await stateService.getLatestSnapshotBeforeChapter(novelId, chapter.order);
    const output = await this.invokePlanner({
      options,
      scopeLabel: `章节规划：第${chapter.order}章《${chapter.title}》`,
      context: [
        `小说：${novel.title}`,
        `简介：${novel.description ?? ""}`,
        `章节目标草稿：${chapter.expectation ?? "无"}`,
        `任务单：${chapter.taskSheet ?? "无"}`,
        `作品圣经：${bible?.rawContent ?? "无"}`,
        `主线大纲：${novel.outline ?? "无"}`,
        `结构化大纲：${novel.structuredOutline ?? "无"}`,
        `角色：${characters.map((item) => `${item.id}|${item.name}|${item.role}|goal=${item.currentGoal ?? ""}|state=${item.currentState ?? ""}`).join("\n") || "无"}`,
        `最近章节摘要：${summaries.map((item) => `${item.summary}`).join("\n") || "无"}`,
        `剧情拍点：${plotBeats.map((item) => `${item.chapterOrder ?? "-"} ${item.title} ${item.content}`).join("\n") || "无"}`,
        `输入状态快照：${stateSnapshot?.summary ?? "无"}`,
      ].join("\n\n"),
      includeScenes: true,
    });
    return this.persistPlan({
      novelId,
      chapterId: chapter.id,
      sourceStateSnapshotId: stateSnapshot?.id ?? null,
      level: "chapter",
      title: output.title || chapter.title,
      objective: output.objective || chapter.expectation?.trim() || `推进第${chapter.order}章主线。`,
      participants: output.participants ?? characters.slice(0, 4).map((item) => item.name),
      reveals: output.reveals ?? [],
      riskNotes: output.riskNotes ?? [],
      hookTarget: output.hookTarget || chapter.hook?.trim() || null,
      scenes: output.scenes ?? [],
    });
  }

  async replan(novelId: string, input: ReplanInput) {
    const chapterId = input.chapterId ?? (await prisma.chapter.findFirst({
      where: { novelId },
      orderBy: { order: "desc" },
      select: { id: true },
    }))?.id;
    if (!chapterId) {
      throw new Error("当前小说没有可重规划的章节。");
    }
    const existingPlan = await this.getChapterPlan(novelId, chapterId);
    const plan = await this.generateChapterPlan(novelId, chapterId, input);
    if (!plan) {
      throw new Error("章节规划生成失败。");
    }
    await prisma.replanRun.create({
      data: {
        novelId,
        chapterId,
        sourcePlanId: existingPlan?.id ?? null,
        triggerType: input.triggerType ?? "manual",
        reason: input.reason,
        outputSummary: `replanned:${plan.id}`,
      },
    });
    return plan;
  }

  shouldTriggerReplanFromAudit(auditReports: AuditReport[]): boolean {
    return auditReports.some((report) => report.issues.some((issue) => issue.status === "open" && (issue.severity === "high" || issue.severity === "critical")));
  }

  private async invokePlanner(input: {
    options: PlannerOptions;
    scopeLabel: string;
    context: string;
    includeScenes: boolean;
  }): Promise<PlannerOutput> {
    const llm = await getLLM(input.options.provider ?? "deepseek", {
      model: input.options.model,
      temperature: input.options.temperature ?? 0.4,
      taskType: "planner",
    });
    const result = await llm.invoke([
      new SystemMessage(
        `你是小说策划。请严格输出 JSON，字段为 title, objective, participants, reveals, riskNotes, hookTarget, scenes。${input.includeScenes ? "scenes 必须是数组，每项含 title, objective, conflict, reveal, emotionBeat。" : "scenes 直接输出空数组。"} 不要输出解释。`,
      ),
      new HumanMessage(
        `${input.scopeLabel}

上下文：
${input.context}

要求：
1. objective 必须明确本次规划的主推进目标。
2. participants 只列关键参与角色名字。
3. reveals 列关键揭露或推进的信息点。
4. riskNotes 列容易跑偏的风险。
5. hookTarget 列章节结尾要留下的钩子。
6. 场景必须有顺序，能直接给写作器消费。`,
      ),
    ]);
    return normalizePlannerOutput(parseJSONObject<PlannerOutput>(toText(result.content)));
  }

  private async persistPlan(input: {
    novelId: string;
    chapterId?: string;
    sourceStateSnapshotId?: string | null;
    level: "book" | "arc" | "chapter";
    title: string;
    objective: string;
    participants: string[];
    reveals: string[];
    riskNotes: string[];
    hookTarget: string | null;
    scenes: Array<{
      title?: string;
      objective?: string;
      conflict?: string;
      reveal?: string;
      emotionBeat?: string;
    }>;
    externalRef?: string;
  }) {
    const existing = input.level === "chapter" && input.chapterId
      ? await prisma.storyPlan.findFirst({
          where: { novelId: input.novelId, chapterId: input.chapterId, level: "chapter" },
          select: { id: true },
        })
      : input.level === "arc" && input.externalRef
        ? await prisma.storyPlan.findFirst({
            where: { novelId: input.novelId, level: "arc", externalRef: input.externalRef },
            select: { id: true },
          })
        : input.level === "book"
          ? await prisma.storyPlan.findFirst({
              where: { novelId: input.novelId, level: "book" },
              select: { id: true },
              orderBy: { updatedAt: "desc" },
            })
          : null;
    const planId = await prisma.$transaction(async (tx) => {
      const plan = existing
        ? await tx.storyPlan.update({
            where: { id: existing.id },
            data: {
              chapterId: input.chapterId ?? null,
              sourceStateSnapshotId: input.sourceStateSnapshotId ?? null,
              title: input.title,
              objective: input.objective,
              participantsJson: JSON.stringify(input.participants),
              revealsJson: JSON.stringify(input.reveals),
              riskNotesJson: JSON.stringify(input.riskNotes),
              hookTarget: input.hookTarget,
              externalRef: input.externalRef ?? null,
              rawPlanJson: JSON.stringify(input),
            },
            select: { id: true },
          })
        : await tx.storyPlan.create({
            data: {
              novelId: input.novelId,
              chapterId: input.chapterId ?? null,
              sourceStateSnapshotId: input.sourceStateSnapshotId ?? null,
              level: input.level,
              title: input.title,
              objective: input.objective,
              participantsJson: JSON.stringify(input.participants),
              revealsJson: JSON.stringify(input.reveals),
              riskNotesJson: JSON.stringify(input.riskNotes),
              hookTarget: input.hookTarget,
              externalRef: input.externalRef ?? null,
              rawPlanJson: JSON.stringify(input),
            },
            select: { id: true },
          });
      await tx.chapterPlanScene.deleteMany({ where: { planId: plan.id } });
      if (input.scenes.length > 0) {
        await tx.chapterPlanScene.createMany({
          data: input.scenes.map((scene, index) => ({
            planId: plan.id,
            sortOrder: index + 1,
            title: scene.title?.trim() || `Scene ${index + 1}`,
            objective: scene.objective?.trim() || null,
            conflict: scene.conflict?.trim() || null,
            reveal: scene.reveal?.trim() || null,
            emotionBeat: scene.emotionBeat?.trim() || null,
          })),
        });
      }
      return plan.id;
    });
    const persistedPlan = await prisma.storyPlan.findUnique({
      where: { id: planId },
      include: {
        scenes: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    if (!persistedPlan) {
      throw new Error("章节规划持久化失败。");
    }
    return persistedPlan;
  }
}

export const plannerService = new PlannerService();
