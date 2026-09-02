import { parseChapterScenePlan } from "@ai-novel/shared/types/chapterLengthControl";
import type { ChapterTaskSheetQualityMode } from "@ai-novel/shared/types/chapterTaskSheetQuality";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../../db/prisma";
import { novelFactService } from "../fact/NovelFactService";
import type { ChapterRouteWindowOptions, ChapterRouteWindowResult } from "./ChapterRouteWindowService";

/**
 * 章节规划即时生成服务（Just-In-Time）
 *
 * 在执行第 N 章之前被调用，确保 task sheet 已就绪。
 * 若章节尚无 task sheet，则调用 volumeService 即时生成，并将已发生事实
 * 注入到生成上下文中。已有完整执行合同必须直接复用；事实变化由正文运行时
 * 上下文承接，不能把每次执行都变成合同重建。
 *
 * 兼容性：
 * - 旧小说已有完整 taskSheet 时直接复用，不因事实数量重复生成。
 * - 只在 autopilot 流水线路径调用（manual 单章模式继续用 ChapterExecutionContractService）。
 */

export interface ChapterPlanJITDeps {
  ensureChapterExecutionContract: (
    novelId: string,
    chapterId: string,
    options: {
      provider?: LLMProvider;
      model?: string;
      temperature?: number;
      taskId?: string;
      guidance?: string;
      entrypoint?: string;
      chapterTaskSheetQualityMode?: ChapterTaskSheetQualityMode;
    },
  ) => Promise<unknown>;
  ensureRouteWindow?: (
    novelId: string,
    fromChapterOrder: number,
    options?: ChapterRouteWindowOptions,
  ) => Promise<ChapterRouteWindowResult>;
  loadChapter?: (novelId: string, chapterId: string) => Promise<{
    id: string;
    order: number;
    taskSheet: string | null;
    sceneCards: string | null;
    targetWordCount: number | null;
    mustAvoid: string | null;
    conflictLevel: number | null;
    revealLevel: number | null;
  } | null>;
  listFacts?: typeof novelFactService.listForChapter;
}

export class ChapterPlanJITService {
  constructor(private readonly deps: ChapterPlanJITDeps) {}

  /**
   * 确保第 N 章的执行合同（task sheet / sceneCards / targetWordCount / mustAvoid）就绪。
   *
   * 调用时机：GenerationContextAssembler.assemble 中，plannerService.ensureChapterPlan 之前。
   * 仅在 advanceMode === "full_book_autopilot" 时调用。
   */
  async ensureExecutionReady(
    novelId: string,
    chapterId: string,
    routeOptions: ChapterRouteWindowOptions = {},
  ): Promise<void> {
    const loadChapter = this.deps.loadChapter ?? ((targetNovelId: string, targetChapterId: string) => prisma.chapter.findFirst({
      where: { id: targetChapterId, novelId: targetNovelId },
      select: {
        id: true,
        order: true,
        taskSheet: true,
        sceneCards: true,
        targetWordCount: true,
        mustAvoid: true,
        conflictLevel: true,
        revealLevel: true,
      },
    }));
    let chapter = await loadChapter(novelId, chapterId);
    if (!chapter) {
      return;
    }

    await this.deps.ensureRouteWindow?.(novelId, chapter.order, routeOptions);

    // 路线补齐可能刚刚同步了当前章合同，必须读取最新持久化结果。
    chapter = await loadChapter(novelId, chapterId);
    if (!chapter) {
      return;
    }

    const hasCompleteTaskSheet = Boolean(chapter.taskSheet?.trim())
      && Boolean(chapter.sceneCards?.trim())
      && typeof chapter.targetWordCount === "number"
      && Boolean(parseChapterScenePlan(chapter.sceneCards, {
        targetWordCount: chapter.targetWordCount ?? undefined,
      }));

    if (hasCompleteTaskSheet) {
      return;
    }

    // 仅在合同缺失、确实需要生成时读取事实账本。
    const facts = await (this.deps.listFacts ?? novelFactService.listForChapter)({
      novelId,
      beforeChapterOrder: chapter.order,
    });

    // task sheet 缺失 —— 生成（含 factLedger 上下文）
    const factGuidance = facts.length > 0 ? buildFactLedgerGuidance(facts) : undefined;
    await this.deps.ensureChapterExecutionContract(novelId, chapterId, {
      provider: routeOptions.provider,
      model: routeOptions.model,
      temperature: routeOptions.temperature,
      taskId: routeOptions.taskId,
      guidance: factGuidance,
      entrypoint: "jit_planner",
      chapterTaskSheetQualityMode: "full_book_autopilot",
    });
  }
}

function buildFactLedgerGuidance(
  facts: Awaited<ReturnType<typeof novelFactService.listForChapter>>,
): string {
  if (facts.length === 0) {
    return "";
  }
  const completed = facts.filter((f) => f.category === "completed");
  const revealed = facts.filter((f) => f.category === "revealed");
  const stateChanged = facts.filter((f) => f.category === "state_changed");

  const lines: string[] = [
    "【已发生事实 / Fact Ledger — 请将以下事实纳入 task sheet 设计，避免重复或矛盾】",
  ];
  if (completed.length > 0) {
    lines.push("已完成目标：");
    for (const f of completed) {
      lines.push(`  - [第${f.chapterOrder}章] ${f.text}`);
    }
  }
  if (revealed.length > 0) {
    lines.push("已揭示信息：");
    for (const f of revealed) {
      lines.push(`  - [第${f.chapterOrder}章] ${f.text}`);
    }
  }
  if (stateChanged.length > 0) {
    lines.push("近期状态变化：");
    for (const f of stateChanged) {
      lines.push(`  - [第${f.chapterOrder}章] ${f.text}`);
    }
  }
  return lines.join("\n");
}

/**
 * 工厂函数，供依赖注入。通常在 volumeService 初始化后调用。
 */
export function createChapterPlanJITService(deps: ChapterPlanJITDeps): ChapterPlanJITService {
  return new ChapterPlanJITService(deps);
}
