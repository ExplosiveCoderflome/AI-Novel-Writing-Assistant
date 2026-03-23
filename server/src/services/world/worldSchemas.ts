import { z } from "zod";

// 由于 WorldService 内部对输出有较多“宽松归一化/补全”，这里的 Schema 主要用于：
// 1) 保证顶层是 JSON object/array，避免把字符串当对象 parse 成功的静默错误
// 2) 为关键层（profile/rules/factions/forces/locations/relations）提供结构提示，提升 repair 成功率

export const worldStructuredDataSchema = z
  .object({
    profile: z.record(z.string(), z.unknown()).optional(),
    rules: z.record(z.string(), z.unknown()).optional(),
    factions: z.array(z.record(z.string(), z.unknown())).optional(),
    forces: z.array(z.record(z.string(), z.unknown())).optional(),
    locations: z.array(z.record(z.string(), z.unknown())).optional(),
    relations: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const worldStructureSectionOutputSchema = z.union([
  z.record(z.string(), z.unknown()),
  z.array(z.record(z.string(), z.unknown())),
]);

