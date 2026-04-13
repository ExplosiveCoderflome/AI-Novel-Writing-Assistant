import type { AgentToolName } from "../agents/types";

function truncateText(value: string, max = 240): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function sanitizeRecordArray(value: unknown, maxItems = 6): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(0, maxItems).map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(item).map(([key, entryValue]) => {
        if (typeof entryValue === "string") {
          return [key, truncateText(entryValue, 160)];
        }
        return [key, entryValue];
      }),
    );
  });
}

function sanitizeNovelSetup(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const setup = value as Record<string, unknown>;
  return {
    stage: setup.stage,
    completionRatio: setup.completionRatio,
    completedCount: setup.completedCount,
    totalCount: setup.totalCount,
    missingItems: Array.isArray(setup.missingItems) ? setup.missingItems.slice(0, 6) : [],
    nextQuestion: typeof setup.nextQuestion === "string" ? truncateText(setup.nextQuestion, 180) : setup.nextQuestion,
    recommendedAction: typeof setup.recommendedAction === "string"
      ? truncateText(setup.recommendedAction, 180)
      : setup.recommendedAction,
    checklist: sanitizeRecordArray(setup.checklist),
  };
}

export function sanitizeCreativeHubToolOutput(
  toolName: AgentToolName,
  output: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!output) {
    return undefined;
  }

  if (toolName === "list_novels") {
    return {
      total: output.total,
      items: sanitizeRecordArray(output.items),
    };
  }

  if (toolName === "create_novel" || toolName === "select_novel_workspace") {
    return {
      novelId: output.novelId,
      title: output.title,
      chapterCount: output.chapterCount,
      status: output.status,
      summary: typeof output.summary === "string" ? truncateText(output.summary) : output.summary,
      setup: sanitizeNovelSetup(output.setup),
    };
  }

  if (toolName === "generate_world_for_novel") {
    return {
      novelId: output.novelId,
      worldId: output.worldId,
      worldName: output.worldName,
      reused: output.reused,
      summary: typeof output.summary === "string" ? truncateText(output.summary) : output.summary,
    };
  }

  if (toolName === "generate_novel_characters") {
    return {
      novelId: output.novelId,
      reused: output.reused,
      characterCount: output.characterCount,
      items: sanitizeRecordArray(output.items),
      summary: typeof output.summary === "string" ? truncateText(output.summary) : output.summary,
    };
  }

  if (toolName === "generate_story_bible") {
    return {
      novelId: output.novelId,
      exists: output.exists,
      coreSetting: typeof output.coreSetting === "string" ? truncateText(output.coreSetting, 260) : output.coreSetting,
      mainPromise: typeof output.mainPromise === "string" ? truncateText(output.mainPromise, 220) : output.mainPromise,
      summary: typeof output.summary === "string" ? truncateText(output.summary) : output.summary,
    };
  }

  if (toolName === "generate_novel_outline") {
    return {
      novelId: output.novelId,
      outline: typeof output.outline === "string" ? truncateText(output.outline, 420) : output.outline,
      outlineLength: output.outlineLength,
      summary: typeof output.summary === "string" ? truncateText(output.summary) : output.summary,
    };
  }

  if (toolName === "generate_structured_outline") {
    return {
      novelId: output.novelId,
      chapterCount: output.chapterCount,
      targetChapterCount: output.targetChapterCount,
      structuredOutline: typeof output.structuredOutline === "string" ? truncateText(output.structuredOutline, 420) : output.structuredOutline,
      summary: typeof output.summary === "string" ? truncateText(output.summary) : output.summary,
    };
  }

  if (toolName === "sync_chapters_from_structured_outline") {
    return {
      novelId: output.novelId,
      chapterCount: output.chapterCount,
      createdCount: output.createdCount,
      updatedCount: output.updatedCount,
      summary: typeof output.summary === "string" ? truncateText(output.summary) : output.summary,
    };
  }

  if (toolName === "start_full_novel_pipeline" || toolName === "get_novel_production_status") {
    return {
      novelId: output.novelId,
      title: output.title,
      worldId: output.worldId,
      worldName: output.worldName,
      chapterCount: output.chapterCount,
      targetChapterCount: output.targetChapterCount,
      currentStage: output.currentStage,
      pipelineJobId: output.pipelineJobId ?? output.jobId,
      pipelineStatus: output.pipelineStatus ?? output.status,
      assetsReady: output.assetsReady,
      pipelineReady: output.pipelineReady,
      failureSummary: typeof output.failureSummary === "string" ? truncateText(output.failureSummary, 200) : output.failureSummary,
      recoveryHint: typeof output.recoveryHint === "string" ? truncateText(output.recoveryHint, 200) : output.recoveryHint,
      assetStages: sanitizeRecordArray(output.assetStages),
      summary: typeof output.summary === "string" ? truncateText(output.summary) : output.summary,
    };
  }

  if (toolName === "bind_world_to_novel") {
    return {
      novelId: output.novelId,
      novelTitle: output.novelTitle,
      worldId: output.worldId,
      worldName: output.worldName,
      summary: typeof output.summary === "string" ? truncateText(output.summary) : output.summary,
    };
  }

  if (toolName === "unbind_world_from_novel") {
    return {
      novelId: output.novelId,
      novelTitle: output.novelTitle,
      previousWorldId: output.previousWorldId,
      previousWorldName: output.previousWorldName,
      worldId: output.worldId ?? null,
      worldName: output.worldName ?? null,
      summary: typeof output.summary === "string" ? truncateText(output.summary) : output.summary,
    };
  }

  if (
    toolName === "get_task_failure_reason"
    || toolName === "get_run_failure_reason"
    || toolName === "get_index_failure_reason"
    || toolName === "get_book_analysis_failure_reason"
    || toolName === "explain_generation_blocker"
    || toolName === "explain_world_conflict"
  ) {
    return {
      failureCode: output.failureCode,
      failureSummary: typeof output.failureSummary === "string" ? truncateText(output.failureSummary, 200) : output.failureSummary,
      failureDetails: typeof output.failureDetails === "string" ? truncateText(output.failureDetails, 320) : output.failureDetails,
      recoveryHint: typeof output.recoveryHint === "string" ? truncateText(output.recoveryHint, 220) : output.recoveryHint,
      lastFailedStep: output.lastFailedStep,
    };
  }

  if (
    toolName === "list_tasks"
    || toolName === "list_knowledge_documents"
    || toolName === "list_book_analyses"
    || toolName === "list_worlds"
    || toolName === "list_writing_formulas"
    || toolName === "list_base_characters"
  ) {
    return {
      total: output.total ?? output.count,
      items: sanitizeRecordArray(output.items),
    };
  }

  if (
    toolName === "get_chapter_content_by_order"
    || toolName === "get_chapter_content"
  ) {
    return {
      chapterId: output.chapterId,
      order: output.order,
      title: output.title,
      content: typeof output.content === "string" ? truncateText(output.content, 500) : output.content,
      contentLength: output.contentLength,
    };
  }

  if (toolName === "summarize_chapter_range") {
    return {
      startOrder: output.startOrder,
      endOrder: output.endOrder,
      chapterCount: output.chapterCount,
      summaryMode: output.summaryMode,
      summary: typeof output.summary === "string" ? truncateText(output.summary, 500) : output.summary,
      chapters: sanitizeRecordArray(output.chapters),
    };
  }

  return Object.fromEntries(
    Object.entries(output).map(([key, value]) => {
      if (typeof value === "string") {
        return [key, truncateText(value, 240)];
      }
      if (Array.isArray(value)) {
        return [key, value.slice(0, 6)];
      }
      return [key, value];
    }),
  );
}
