export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  let nextIndex = 0;
  let firstError: unknown = null;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        if (firstError) {
          return;
        }
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) {
          return;
        }
        try {
          await worker(items[index], index);
        } catch (error) {
          firstError ??= error;
          return;
        }
      }
    }),
  );

  if (firstError) {
    throw firstError;
  }
}
