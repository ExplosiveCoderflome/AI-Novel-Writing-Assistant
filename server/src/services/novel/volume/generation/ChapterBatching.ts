/** Sequential batches are validated before merging; failures never return a partial result. */
export async function generateChapterBatches<T>(count: number, generate: (offset: number, count: number, previous: T[]) => Promise<T[]>, batchSize = 8): Promise<T[]> {
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(batchSize) || batchSize < 1) throw new Error("章节分批参数无效。");
  const chapters: T[] = [];
  let nextSize = batchSize;
  let attempts = 0;
  while (chapters.length < count) {
    if (++attempts > count * 2 + 1) throw new Error("章节分批达到请求上限，请检查模型输出能力。");
    const size = Math.min(nextSize, count - chapters.length);
    try {
      const result = await generate(chapters.length, size, chapters.slice());
      if (result.length !== size) throw new Error(`章节分批应返回 ${size} 项，实际 ${result.length} 项。`);
      chapters.push(...result);
      nextSize = batchSize;
    } catch (error) {
      if (size > 1 && typeof error === "object" && error !== null && "category" in error && error.category === "incomplete_json") {
        nextSize = Math.max(1, Math.floor(size / 2));
        continue;
      }
      throw error;
    }
  }
  return chapters;
}
