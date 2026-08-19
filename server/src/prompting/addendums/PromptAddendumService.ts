import { prisma } from "../../db/prisma";
import { createContextBlock } from "../core/contextBudget";
import type { PromptContextBlock } from "../core/promptTypes";
import { listRegisteredPromptAssets } from "../registry";

export type PromptAddendumScope = "global" | "novel";

export interface PromptAddendumView {
  id: string;
  scope: PromptAddendumScope;
  novelId?: string | null;
  promptId: string;
  title: string;
  content: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PromptAddendumInput {
  id?: string;
  scope: PromptAddendumScope;
  novelId?: string | null;
  promptId: string;
  title: string;
  content: string;
  enabled?: boolean;
}

export interface PromptAddendumFilter {
  promptId?: string;
  novelId?: string;
}

export const CUSTOM_ADDENDUM_CONTEXT_GROUP = "custom_addendum";

export const SUPPORTED_PROMPT_ADDENDUM_IDS = [
  "novel.chapter.writer",
  "audit.chapter.full",
  "audit.chapter.light",
  "novel.review.repair",
  "novel.review.patch",
] as const;

const SUPPORTED_PROMPT_ADDENDUM_ID_SET = new Set<string>(SUPPORTED_PROMPT_ADDENDUM_IDS);

const PROMPT_ADDENDUM_DESCRIPTIONS: Record<string, string> = {
  "novel.chapter.writer": "根据章节任务、角色状态、世界规则和风格约束生成章节正文。",
  "audit.chapter.full": "完整检查章节质量，输出结构化问题、评分和修复建议。",
  "audit.chapter.light": "快速检查章节是否适合继续推进，识别明显风险。",
  "novel.review.repair": "根据审校问题和上下文，对整章进行最小必要修复。",
  "novel.review.patch": "根据审校问题生成局部补丁计划，优先减少整章重写。",
  "novel.review.chapter": "对章节正文进行结构化审校，供后续修文使用。",
  "novel.chapter.summary": "把章节正文压缩成可追踪、可回顾的章节摘要。",
  "novel.chapter_editor.rewrite_candidates": "为章节编辑器生成候选改写方案。",
  "novel.chapter_editor.user_intent": "理解用户在章节编辑器里的改稿意图。",
  "novel.chapter_editor.workspace_diagnosis": "诊断章节编辑器当前段落和上下文状态。",
  "novel.director.workspace_analysis": "分析自动导演工作区，判断下一步推进重点。",
  "novel.director.manual_edit_impact": "评估手动改动对导演任务和后续流程的影响。",
  "planner.intent.parse": "理解用户自然语言意图，输出可执行的规划意图。",
};

const MAX_TITLE_LENGTH = 80;
const MAX_CONTENT_LENGTH = 4000;

type PromptAddendumRecord = {
  id: string;
  scope: string;
  novelId: string | null;
  promptId: string;
  title: string;
  content: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export function isPromptAddendumSupported(promptId: string): boolean {
  return SUPPORTED_PROMPT_ADDENDUM_ID_SET.has(promptId);
}

export function getPromptAddendumScopeLabels(promptId: string): string[] {
  return isPromptAddendumSupported(promptId) ? ["全局", "单本小说"] : [];
}

export function getPromptCatalogDescription(promptId: string, taskType?: string): string {
  const explicit = PROMPT_ADDENDUM_DESCRIPTIONS[promptId];
  if (explicit) {
    return explicit;
  }

  switch (taskType) {
    case "writer":
      return "生成或改写面向读者的正文内容。";
    case "critical_review":
      return "检查内容质量并输出可执行的审校结果。";
    case "repair":
      return "根据问题和约束修复已有内容。";
    case "planner":
      return "理解目标并生成结构化规划结果。";
    case "summary":
      return "压缩内容，生成便于追踪的摘要。";
    default:
      return "注册在提示词目录中的内部提示词。";
  }
}

function toView(record: PromptAddendumRecord): PromptAddendumView {
  return {
    id: record.id,
    scope: record.scope as PromptAddendumScope,
    novelId: record.novelId,
    promptId: record.promptId,
    title: record.title,
    content: record.content,
    enabled: record.enabled,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function assertSupportedPrompt(promptId: string): void {
  if (!isPromptAddendumSupported(promptId)) {
    throw new Error(`当前提示词不支持自定义补充要求：${promptId}`);
  }

  const hasRegisteredPrompt = listRegisteredPromptAssets().some((asset) => asset.id === promptId);
  if (!hasRegisteredPrompt) {
    throw new Error(`提示词未注册：${promptId}`);
  }
}

function normalizeInput(input: PromptAddendumInput): PromptAddendumInput {
  const scope = input.scope;
  if (scope !== "global" && scope !== "novel") {
    throw new Error("补充要求范围只能是 global 或 novel。");
  }

  const promptId = input.promptId.trim();
  assertSupportedPrompt(promptId);

  const title = input.title.trim();
  if (title.length === 0 || title.length > MAX_TITLE_LENGTH) {
    throw new Error(`标题长度需在 1-${MAX_TITLE_LENGTH} 字之间。`);
  }

  const content = input.content.trim();
  if (content.length === 0 || content.length > MAX_CONTENT_LENGTH) {
    throw new Error(`补充要求长度需在 1-${MAX_CONTENT_LENGTH} 字之间。`);
  }

  const novelId = scope === "novel" ? input.novelId?.trim() : null;
  if (scope === "novel" && !novelId) {
    throw new Error("单本小说补充要求需要 novelId。");
  }

  return {
    id: input.id?.trim() || undefined,
    scope,
    novelId,
    promptId,
    title,
    content,
    enabled: input.enabled ?? true,
  };
}

function isMissingPromptAddendumTableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.includes("PromptAddendum") && (
    error.message.includes("does not exist")
    || error.message.includes("no such table")
    || error.message.includes("Unknown table")
  );
}

export class PromptAddendumService {
  async list(filter: PromptAddendumFilter = {}): Promise<PromptAddendumView[]> {
    const promptId = filter.promptId?.trim();
    const novelId = filter.novelId?.trim();
    const rows = await prisma.promptAddendum.findMany({
      where: {
        ...(promptId ? { promptId } : {}),
        OR: novelId
          ? [
              { scope: "global", novelId: null },
              { scope: "novel", novelId },
            ]
          : [{ scope: "global", novelId: null }],
      },
      orderBy: [
        { scope: "asc" },
        { promptId: "asc" },
        { updatedAt: "desc" },
      ],
    });
    return rows.map(toView);
  }

  async save(input: PromptAddendumInput): Promise<PromptAddendumView> {
    const normalized = normalizeInput(input);

    if (normalized.scope === "novel" && normalized.novelId) {
      const novel = await prisma.novel.findUnique({
        where: { id: normalized.novelId },
        select: { id: true },
      });
      if (!novel) {
        throw new Error(`小说不存在：${normalized.novelId}`);
      }
    }

    if (normalized.id) {
      const updated = await prisma.promptAddendum.update({
        where: { id: normalized.id },
        data: {
          scope: normalized.scope,
          novelId: normalized.novelId ?? null,
          promptId: normalized.promptId,
          title: normalized.title,
          content: normalized.content,
          enabled: normalized.enabled,
        },
      });
      return toView(updated);
    }

    const existing = await prisma.promptAddendum.findFirst({
      where: {
        scope: normalized.scope,
        novelId: normalized.novelId ?? null,
        promptId: normalized.promptId,
      },
      orderBy: { updatedAt: "desc" },
    });

    const row = existing
      ? await prisma.promptAddendum.update({
          where: { id: existing.id },
          data: {
            title: normalized.title,
            content: normalized.content,
            enabled: normalized.enabled,
          },
        })
      : await prisma.promptAddendum.create({
          data: {
            scope: normalized.scope,
            novelId: normalized.novelId ?? null,
            promptId: normalized.promptId,
            title: normalized.title,
            content: normalized.content,
            enabled: normalized.enabled,
          },
        });
    return toView(row);
  }

  async setEnabled(id: string, enabled: boolean): Promise<PromptAddendumView> {
    const row = await prisma.promptAddendum.update({
      where: { id },
      data: { enabled },
    });
    return toView(row);
  }

  async delete(id: string): Promise<void> {
    await prisma.promptAddendum.delete({
      where: { id },
    });
  }

  async resolveContextBlocks(input: {
    promptId: string;
    novelId?: string;
  }): Promise<PromptContextBlock[]> {
    if (!isPromptAddendumSupported(input.promptId)) {
      return [];
    }

    try {
      const rows = await prisma.promptAddendum.findMany({
        where: {
          promptId: input.promptId,
          enabled: true,
          OR: input.novelId
            ? [
                { scope: "global", novelId: null },
                { scope: "novel", novelId: input.novelId },
              ]
            : [{ scope: "global", novelId: null }],
        },
        orderBy: [
          { scope: "asc" },
          { updatedAt: "asc" },
        ],
      });

      return rows
        .filter((row) => row.content.trim().length > 0)
        .sort((left, right) => {
          const scopeOrder = (scope: string) => scope === "global" ? 0 : 1;
          return scopeOrder(left.scope) - scopeOrder(right.scope)
            || left.updatedAt.getTime() - right.updatedAt.getTime();
        })
        .map((row, index) => createContextBlock({
          id: `${CUSTOM_ADDENDUM_CONTEXT_GROUP}:${row.scope}:${row.id}`,
          group: CUSTOM_ADDENDUM_CONTEXT_GROUP,
          priority: row.scope === "global" ? 999 - index : 899 - index,
          required: true,
          allowSummary: true,
          content: [
            row.scope === "global" ? "【全局补充要求】" : "【本书补充要求】",
            row.title,
            row.content,
          ].join("\n"),
        }));
    } catch (error) {
      if (!isMissingPromptAddendumTableError(error)) {
        console.warn("[prompt.addendum] failed to resolve custom addendums", error);
      }
      return [];
    }
  }
}

export const promptAddendumService = new PromptAddendumService();
