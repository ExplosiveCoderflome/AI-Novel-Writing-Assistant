import type { GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import type { ReviewOptions } from "../../novelCoreShared";
import { logPipelineError } from "../../novelCoreShared";
import { GenerationContextAssembler } from "../GenerationContextAssembler";

export type AuditContextOperation = "review" | "audit" | "repair";

export class ChapterContextAssemblyError extends Error {
  readonly code = "chapter_context_assembly_failed";
  readonly novelId: string;
  readonly chapterId: string;
  readonly operation: AuditContextOperation;
  readonly cause: unknown;

  constructor(
    novelId: string,
    chapterId: string,
    operation: AuditContextOperation,
    cause: unknown,
  ) {
    const operationLabel = operation === "review"
      ? "章节审阅"
      : operation === "audit"
        ? "章节审计"
        : "章节修复";
    super(`章节上下文装配失败，无法继续${operationLabel}。请先检查当前项目的卷级规划、章节计划和运行时资产是否完整后重试。`);
    this.name = "ChapterContextAssemblyError";
    this.novelId = novelId;
    this.chapterId = chapterId;
    this.operation = operation;
    this.cause = cause;
  }
}

export async function assembleChapterAuditContextPackage(input: {
  novelId: string;
  chapterId: string;
  options: ReviewOptions;
  operation: AuditContextOperation;
  assembler?: Pick<GenerationContextAssembler, "assemble">;
}): Promise<GenerationContextPackage> {
  const assembler = input.assembler ?? new GenerationContextAssembler();
  try {
    const assembled = await assembler.assemble(input.novelId, input.chapterId, {
      provider: input.options.provider,
      model: input.options.model,
      temperature: input.options.temperature,
    });
    return assembled.contextPackage;
  } catch (error) {
    logPipelineError("Failed to assemble chapter context package.", {
      novelId: input.novelId,
      chapterId: input.chapterId,
      operation: input.operation,
      provider: input.options.provider ?? null,
      model: input.options.model ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ChapterContextAssemblyError(input.novelId, input.chapterId, input.operation, error);
  }
}
