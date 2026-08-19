import { prisma } from "../../db/prisma";
import { loadAllBuiltinBenchmarks } from "../benchmarks";

export async function seedEvalBenchmarks(): Promise<{ syncedCount: number }> {
  const benchmarks = loadAllBuiltinBenchmarks();
  let count = 0;

  for (const item of benchmarks) {
    await prisma.modelEvalBenchmarkDataset.upsert({
      where: { id: item.id },
      create: {
        id: item.id,
        capability: item.capability,
        category: item.category ?? null,
        title: item.title,
        description: item.description ?? null,
        promptText: item.promptText,
        expectedOutput: item.expectedOutput ?? null,
        metadataJson: item.metadataJson ?? null,
        isBuiltin: true,
      },
      update: {
        capability: item.capability,
        category: item.category ?? null,
        title: item.title,
        description: item.description ?? null,
        promptText: item.promptText,
        expectedOutput: item.expectedOutput ?? null,
        metadataJson: item.metadataJson ?? null,
        isBuiltin: true,
      },
    });
    count++;
  }

  return { syncedCount: count };
}
