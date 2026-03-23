import { z } from "zod";

// 拆书/分析模块的 JSON 输出在不同 sectionKey 下字段不同，
// 当前 schema 先做“对象校验”，并在后续 migration 中逐步收紧字段约束。
export const bookAnalysisRawOutputSchema = z
  .record(z.string(), z.unknown());

