import type { GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import type { StyleRewriteBaseline } from "@ai-novel/shared/types/styleEngine";
import type { ChapterAcceptanceAssessmentResult } from "../../../../services/novel/runtime/ChapterAcceptanceAssessmentService";
import type { ChapterAcceptanceAssessmentOutput } from "../../../../prompting/prompts/novel/chapterAcceptance.prompts";
import type { AcceptanceVerdict, StageId, UnitRef } from "../../domain";
import type { StageDescriptor, UnitRun } from "../../application";
import type { ProductionJson } from "../../common";

export interface ChapterBaseline { content: string | null; updatedAt: string; protectedUserContent: boolean }
export interface PreparedChapter {
  baseline: ChapterBaseline;
  novelTitle: string;
  chapterTitle: string;
  contextPackage: GenerationContextPackage;
}
export interface PreparedStageCall extends StageDescriptor { input: ProductionJson }
export interface ChapterStageServices {
  purpose: "automatic" | "user_requested";
  readBaseline(unit: UnitRef): Promise<ChapterBaseline>;
  /** Existing execution preparation + read-only context assembler, supplied by app composition. */
  prepare(run: UnitRun): Promise<Omit<PreparedChapter, "baseline">>;
  /** Fully render/fingerprint the actual registered Prompt/model configuration. No models or writes. */
  describe(stage: Exclude<StageId, "select">, run: UnitRun, input: ProductionJson): Promise<PreparedStageCall>;
  /** Each physical request/retry is durably reserved. Guard failures must not become quality debt. */
  scoped<T>(run: UnitRun, invocation: StageDescriptor & { requestKey: string }, operation: () => Promise<T>): Promise<T>;
  write(run: UnitRun, prepared: PreparedChapter, call: PreparedStageCall): Promise<string>;
  /** Uses the existing gate with persistAssessment=false and a caller-bound frozen review retry scope. */
  assess(input: { run: UnitRun; prepared: PreparedChapter; content: string; persistAssessment: false;
    call: PreparedStageCall; repairReviewBaseline?: ChapterAcceptanceAssessmentOutput; styleRewriteBaseline?: StyleRewriteBaseline }): Promise<ChapterAcceptanceAssessmentResult>;
  /** Calls the existing bounded patch repair; never publishes a candidate to Chapter. */
  repair(input: { run: UnitRun; prepared: PreparedChapter; content: string; assessment: ChapterAcceptanceAssessmentResult; call: PreparedStageCall }): Promise<{
    content: string; styleRewriteBaseline?: StyleRewriteBaseline; failureCode?: string;
  }>;
  /** Only classify known, structured patch failures as recoverable; transport/guard failures propagate. */
  knownRepairFailure(error: unknown): string | null;
  replanScope?(assessment: ChapterAcceptanceAssessmentResult): AcceptanceVerdict["replan"];
}
