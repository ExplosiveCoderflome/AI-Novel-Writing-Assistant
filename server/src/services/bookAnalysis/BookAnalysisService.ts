import type {
  BookAnalysis,
  BookAnalysisDetail,
  BookAnalysisPublishResult,
  BookAnalysisSectionKey,
  BookAnalysisStatus,
} from "@ai-novel/shared/types/bookAnalysis";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { BookAnalysisCommandService } from "./application/BookAnalysisCommandService";
import { BookAnalysisQueryService } from "./application/BookAnalysisQueryService";

class BookAnalysisServiceFacade {
  private readonly queryService = new BookAnalysisQueryService();
  private readonly commandService = new BookAnalysisCommandService(this.queryService);

  startWatchdog(): void {
    this.commandService.startWatchdog();
  }

  stopWatchdog(): void {
    this.commandService.stopWatchdog();
  }

  markPendingAnalysesForManualRecovery(): Promise<void> {
    return this.commandService.markPendingAnalysesForManualRecovery();
  }

  recoverTimedOutAnalyses(): Promise<void> {
    return this.commandService.recoverTimedOutAnalyses();
  }

  resumePendingAnalysis(analysisId: string): Promise<BookAnalysisDetail> {
    return this.commandService.resumePendingAnalysis(analysisId);
  }

  listAnalyses(filters: {
    keyword?: string;
    status?: BookAnalysisStatus;
    documentId?: string;
  } = {}): Promise<BookAnalysis[]> {
    return this.queryService.listAnalyses(filters);
  }

  getAnalysisById(analysisId: string): Promise<BookAnalysisDetail | null> {
    return this.queryService.getAnalysisById(analysisId);
  }

  createAnalysis(input: {
    documentId: string;
    versionId?: string;
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    budgetTokens?: number | null;
    userFocusInstruction?: string | null;
    sourceRange?: { startChapterIndex: number; endChapterIndex: number } | null;
    includeTimeline?: boolean;
    enabledSectionKeys?: BookAnalysisSectionKey[];
  }): Promise<BookAnalysisDetail> {
    return this.commandService.createAnalysis(input);
  }

  copyAnalysis(analysisId: string): Promise<BookAnalysisDetail> {
    return this.commandService.copyAnalysis(analysisId);
  }

  rebuildAnalysis(analysisId: string): Promise<BookAnalysisDetail> {
    return this.commandService.rebuildAnalysis(analysisId);
  }

  updateBudget(analysisId: string, budgetTokens: number | null): Promise<BookAnalysisDetail> {
    return this.commandService.updateBudget(analysisId, budgetTokens);
  }

  resumeWithBudget(analysisId: string, budgetTokens: number): Promise<BookAnalysisDetail> {
    return this.commandService.resumeWithBudget(analysisId, budgetTokens);
  }

  retryAnalysis(analysisId: string): Promise<BookAnalysisDetail> {
    return this.commandService.retryAnalysis(analysisId);
  }

  cancelAnalysis(analysisId: string): Promise<BookAnalysisDetail> {
    return this.commandService.cancelAnalysis(analysisId);
  }

  regenerateSection(
    analysisId: string,
    sectionKey: BookAnalysisSectionKey,
    input: { focusInstruction?: string | null } = {},
  ): Promise<BookAnalysisDetail> {
    return this.commandService.regenerateSection(analysisId, sectionKey, input);
  }

  optimizeSectionPreview(
    analysisId: string,
    sectionKey: BookAnalysisSectionKey,
    input: { currentDraft: string; instruction: string },
  ): Promise<{ optimizedDraft: string }> {
    return this.commandService.optimizeSectionPreview(analysisId, sectionKey, input);
  }

  updateSection(
    analysisId: string,
    sectionKey: BookAnalysisSectionKey,
    input: {
      editedContent?: string | null;
      notes?: string | null;
      focusInstruction?: string | null;
      frozen?: boolean;
    },
  ): Promise<BookAnalysisDetail> {
    return this.commandService.updateSection(analysisId, sectionKey, input);
  }

  updateAnalysisStatus(
    analysisId: string,
    status: Extract<BookAnalysisStatus, "archived">,
  ): Promise<BookAnalysisDetail> {
    return this.commandService.updateAnalysisStatus(analysisId, status);
  }

  publishToNovelKnowledge(analysisId: string, novelId: string): Promise<BookAnalysisPublishResult> {
    return this.queryService.publishToNovelKnowledge(analysisId, novelId);
  }

  buildExportContent(
    analysisId: string,
    format: "markdown" | "json",
  ): Promise<{
    fileName: string;
    contentType: string;
    content: string;
  }> {
    return this.queryService.buildExportContent(analysisId, format);
  }
}

export const bookAnalysisService = new BookAnalysisServiceFacade();
