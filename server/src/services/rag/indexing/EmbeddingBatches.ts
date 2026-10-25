import { ragConfig } from "../../../config/rag";
import type { EmbeddingService } from "../EmbeddingService";
import { runWithConcurrency } from "../utils";

export async function embedCheckpointedBatches(
  embeddingService: EmbeddingService,
  texts: string[],
  checkpointScope: string,
  assertActive: () => Promise<void>,
  onProgress?: (payload: { processed: number; total: number }) => Promise<void>,
): Promise<{ vectors: number[][]; provider: string; model: string }> {
  if (texts.length === 0) {
    return { vectors: [], provider: ragConfig.embeddingProvider, model: ragConfig.embeddingModel };
  }
  const batchSize = ragConfig.embeddingBatchSize;
  const concurrency = ragConfig.embeddingConcurrency;
  const vectors: number[][] = new Array(texts.length);
  let provider = ragConfig.embeddingProvider;
  let model = ragConfig.embeddingModel;
  let processed = 0;
  let lastReportPercent = 0;
  let dimension = 0;

  const batches: { start: number; texts: string[] }[] = [];
  for (let cursor = 0; cursor < texts.length; cursor += batchSize) {
    batches.push({ start: cursor, texts: texts.slice(cursor, cursor + batchSize) });
  }

  await runWithConcurrency(batches, concurrency, async (batch) => {
    await assertActive();
    const result = await embeddingService.embedTexts(batch.texts, { checkpointScope, assertActive });
    if (processed > 0 && (provider !== result.provider || model !== result.model)) {
      throw new Error("RAG embedding 模型配置在任务执行期间发生变化，请重新索引。");
    }
    const size = result.vectors[0]?.length ?? 0;
    if (result.vectors.length !== batch.texts.length || size === 0
      || result.vectors.some((vector) => vector.length !== size || vector.some((value) => !Number.isFinite(value)))
      || (dimension > 0 && dimension !== size)) {
      throw new Error("RAG embedding 分批结果数量或向量维度不一致。");
    }
    dimension = size;
    provider = result.provider;
    model = result.model;
    for (let i = 0; i < result.vectors.length; i += 1) {
      vectors[batch.start + i] = result.vectors[i];
    }
    processed += batch.texts.length;

    if (onProgress) {
      const percent = texts.length > 0 ? processed / texts.length : 1;
      if (percent - lastReportPercent >= 0.03 || processed >= texts.length) {
        lastReportPercent = percent;
        await onProgress({ processed: Math.min(processed, texts.length), total: texts.length });
      }
    }
  });

  return { vectors, provider, model };
}
