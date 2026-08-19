import { parseChapterScenePlan } from "@ai-novel/shared/types/chapterLengthControl";
import type { ChapterTaskSheetQualityMode } from "@ai-novel/shared/types/chapterTaskSheetQuality";
import { prisma } from "../../../db/prisma";
import { novelFactService } from "../fact/NovelFactService";

/**
 * 章节规划即时生成服务（Just-In-Time）
 *
 * 在执行第 N 章之前被调用，确保 task sheet 已就绪。
 * 若章节尚无 task sheet，或 factLedger 有新数据（前文已写），
 * 则调用 volumeService 即时生成，将已发生事实注入到生成上下文中。
 *
 * 兼容性：
 * - 旧小说若 factLedger 为空（前文未写），回退到现有 taskSheet。
 * - 旧小说若 taskSheet 已存在且 factLedger 为空，直接跳过不重新生成。
 * - 只在 autopilot 流水线路径调用（manual 单章模式继续用 ChapterExecutionContractService）。
 */

const JIT_MIN_FACTS_FOR_REFRESH = 3;

export interface ChapterPlanJITDeps {
  ensureChapterExecutionContract: (
    novelId: string,
    chapterId: string,
    options: {
      guidance?: string;
      entrypoint?: string;
      chapterTaskSheetQualityMode?: ChapterTaskSheetQualityMode;
    },
  ) => Promise<unknown>;
}

export class ChapterPlanJITService {
  constructor(private readonly deps: ChapterPlanJITDeps) {}

  /**
   * 确保第 N 章的执行合同（task sheet / sceneCards / targetWordCount / mustAvoid）就绪。
   *
   * 调用时机：GenerationContextAssembler.assemble 中，plannerService.ensureChapterPlan 之前。
   * 仅在 advanceMode === "full_book_autopilot" 时调用。
   */
  async ensureExecutionReady(novelId: string, chapterId: string): Promise<void> {
    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId },
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
    });
    if (!chapter) {
      return;
    }

    const hasCompleteTaskSheet = Boolean(chapter.taskSheet?.trim())
      && Boolean(chapter.sceneCards?.trim())
      && typeof chapter.targetWordCount === "number"
      && Boolean(parseChapterScenePlan(chapter.sceneCards, {
        targetWordCount: chapter.targetWordCount ?? undefined,
      }));

    // 拉取前文事实账本
    const facts = await novelFactService.listForChapter({
      novelId,
      beforeChapterOrder: chapter.order,
    });

    if (hasCompleteTaskSheet && facts.length < JIT_MIN_FACTS_FOR_REFRESH) {
      // task sheet 已存在，且前文事实不足（旧小说 / 首章），跳过
      return;
    }

    if (hasCompleteTaskSheet && facts.length >= JIT_MIN_FACTS_FOR_REFRESH) {
      // task sheet 已存在但前文有足够事实 —— 重新生成以纳入实际进度
      const factGuidance = buildFactLedgerGuidance(facts);
      await this.deps.ensureChapterExecutionContract(novelId, chapterId, {
        guidance: factGuidance,
        entrypoint: "jit_planner",
        chapterTaskSheetQualityMode: "full_book_autopilot",
      });
      return;
    }

    // task sheet 缺失 —— 生成（含 factLedger 上下文）
    const factGuidance = facts.length > 0 ? buildFactLedgerGuidance(facts) : undefined;
    await this.deps.ensureChapterExecutionContract(novelId, chapterId, {
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
