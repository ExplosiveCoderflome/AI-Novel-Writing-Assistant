import fs from "fs";
import path from "path";

export interface BenchmarkTestCase {
  id: string;
  capability: string;
  category?: string;
  title: string;
  description?: string;
  promptText: string;
  expectedOutput?: string | null;
  metadataJson?: string | null;
  isBuiltin: boolean;
}

const BENCHMARK_FILES = [
  path.join(__dirname, "text-gen/llm_eval.json"),
  path.join(__dirname, "embedding/embedding_pairs_eval.json"),
  path.join(__dirname, "sparse/bm25_entity_eval.json"),
  path.join(__dirname, "image/image_prompts_eval.json"),
  path.join(__dirname, "audio/audio_eval.json"),
  path.join(__dirname, "vision/ocr_eval.json"),
];

export function loadAllBuiltinBenchmarks(): BenchmarkTestCase[] {
  const allCases: BenchmarkTestCase[] = [];
  for (const filePath of BENCHMARK_FILES) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          allCases.push(...parsed);
        }
      }
    } catch (err) {
      console.warn(`[benchmarks] Failed to load benchmark file ${filePath}:`, err);
    }
  }
  return allCases;
}
