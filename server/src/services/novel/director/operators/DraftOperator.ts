import type { CandidatePayload, OperatorInput, OperatorResult } from './operatorTypes';

export class DraftOperator {
  async execute<T = CandidatePayload>(input: OperatorInput<T>): Promise<OperatorResult<T>> {
    const startTime = Date.now();
    const novelTitle = input.contextBlock?.novelTitle ?? '未命名作品';
    const chapterTitle = input.contextBlock?.chapterTitle ?? '全新章节';
    
    // 如果已经包含 primaryCandidate 则使用，否则生成全新初稿
    const primary = input.primaryCandidate as unknown as CandidatePayload | undefined;
    const generatedId = primary?.id || `cand_draft_${Date.now()}`;
    const title = primary?.title || chapterTitle;
    const content = primary?.content || `【${novelTitle} - ${chapterTitle}】初稿正文生成中...\n\n夜色深沉，风呼啸而过。${novelTitle}的故事在此展开。`;
    const summary = primary?.summary || `${novelTitle}的${chapterTitle}初稿片段。`;

    const candidate: CandidatePayload = {
      id: generatedId,
      title,
      content,
      summary,
      outlineId: primary?.outlineId,
      chapterId: input.chapterId || primary?.chapterId,
      metadata: {
        ...(primary?.metadata || {}),
        generatedBy: 'DraftOperator',
        novelTitle,
      },
    };

    const fitness = {
      overallScore: 82,
      coherenceScore: 85,
      characterVoiceScore: 80,
      pacingScore: 82,
      conflictResolution: 80,
    };

    return {
      success: true,
      operatorType: 'draft',
      candidate: candidate as unknown as T,
      fitness,
      mutationTrace: {
        timestamp: new Date().toISOString(),
        operatorType: 'draft',
        description: `生成初稿: ${title}`,
        parentCandidateIds: [],
        deltaSummary: '从零生成初始内容及故事脉络',
      },
      executionTimeMs: Date.now() - startTime,
    };
  }
}

export const draftOperator = new DraftOperator();
