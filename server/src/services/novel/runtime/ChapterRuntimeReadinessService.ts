import type { GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";

export interface ChapterRuntimeReadinessResult {
  ready: boolean;
  reasons: string[];
}

function compactText(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export class ChapterRuntimeReadinessService {
  evaluate(contextPackage: GenerationContextPackage): ChapterRuntimeReadinessResult {
    const reasons: string[] = [];
    const chapter = contextPackage.chapter;
    const mission = contextPackage.chapterWriteContext?.chapterMission ?? contextPackage.chapterMission ?? null;
    const hasChapterGoal = Boolean(
      compactText(mission?.objective)
      || compactText(mission?.expectation)
      || compactText(chapter.expectation)
      || compactText(contextPackage.plan?.objective)
      || compactText(contextPackage.plan?.title),
    );

    if (!compactText(chapter.title)) {
      reasons.push("请先补全章节标题，再生成正文。");
    }

    if (!hasChapterGoal) {
      reasons.push("请先为本章准备章节任务或章节目标，再生成正文。");
    }

    if (!contextPackage.chapterWriteContext) {
      reasons.push("章节写作上下文尚未准备完成，请先刷新本章上下文。");
    }

    if (contextPackage.characterRoster.length === 0) {
      reasons.push("请先在本小说中至少准备一个角色，再生成正文。");
    }

    return {
      ready: reasons.length === 0,
      reasons,
    };
  }

  assertReady(contextPackage: GenerationContextPackage): void {
    const result = this.evaluate(contextPackage);
    if (result.ready) {
      return;
    }
    throw new Error(result.reasons.join(" "));
  }
}
