export const CHAPTER_EXECUTION_CONTRACT_INCOMPLETE_FAILURE_CODE = "CHAPTER_EXECUTION_CONTRACT_INCOMPLETE";

interface ChapterExecutionContractQualityGateErrorInput {
  novelId: string;
  volumeId: string;
  chapterId: string;
  chapterOrder: number;
  message: string;
}

export class ChapterExecutionContractQualityGateError extends Error {
  readonly code = CHAPTER_EXECUTION_CONTRACT_INCOMPLETE_FAILURE_CODE;
  readonly novelId: string;
  readonly volumeId: string;
  readonly chapterId: string;
  readonly chapterOrder: number;

  constructor(input: ChapterExecutionContractQualityGateErrorInput) {
    super(input.message);
    this.name = "ChapterExecutionContractQualityGateError";
    this.novelId = input.novelId;
    this.volumeId = input.volumeId;
    this.chapterId = input.chapterId;
    this.chapterOrder = input.chapterOrder;
  }
}

export function isChapterExecutionContractQualityGateError(
  error: unknown,
): error is ChapterExecutionContractQualityGateError {
  return error instanceof ChapterExecutionContractQualityGateError;
}
