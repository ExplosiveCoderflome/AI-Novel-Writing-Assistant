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
 * 注入到生成上下文中。已有完整执行合同还须与实际前文核对；相同输入复用
 * 核对结果，只有 AI 明确给出修订指导时才进入现有合同生成链。
 *
 * 兼容性：
 * - 不按事实数量重建合同；准备度和语义核对均由中央合同服务拥有。
 * - 选定范围的导演执行只准备当前合同，不自动扩展路线窗口。
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
  } | null>;
  listFacts?: typeof novelFactService.listForChapter;
}

export class ChapterPlanJITService {
  constructor(private readonly deps: ChapterPlanJITDeps) {}

  /**
   * 确保第 N 章的执行合同（task sheet / sceneCards / targetWordCount / mustAvoid）就绪。
   *
   * 调用时机：ChapterExecutionPreparationService 中，plannerService.ensureChapterPlan 之前。
   * 仅在 advanceMode === "full_book_autopilot" 时调用。
   */
  async ensureExecutionReady(
    novelId: string,
    chapterId: string,
    routeOptions: ChapterRouteWindowOptions & { prepareRouteWindow?: boolean } = {},
  ): Promise<void> {
    const loadChapter = this.deps.loadChapter ?? ((targetNovelId: string, targetChapterId: string) => prisma.chapter.findFirst({
      where: { id: targetChapterId, novelId: targetNovelId },
      select: {
        id: true,
        order: true,
      },
    }));
    let chapter = await loadChapter(novelId, chapterId);
    if (!chapter) {
      return;
    }

    if (routeOptions.prepareRouteWindow !== false) await this.deps.ensureRouteWindow?.(novelId, chapter.order, routeOptions);

    // 合同是否可复用由唯一的准备度策略判断；JIT 不再维护第二套字段规则。
    const facts = await (this.deps.listFacts ?? novelFactService.listForChapter)({
      novelId,
      beforeChapterOrder: chapter.order,
    });

    // 中央准备服务会自行判断复用或刷新；事实账本仅作为确需刷新时的生成上下文。
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
