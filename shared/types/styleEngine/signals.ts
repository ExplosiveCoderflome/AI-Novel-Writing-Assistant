import { z } from "zod";

const terms = z.array(z.string().min(1).max(24)).max(32);
/** Versioned candidate-evidence policy; never an automatic rewriting policy. */
export const styleSignalPolicySchema = z.object({
  revision: z.literal("style-signals-v1"),
  transitionTerms: terms.default(["值得注意的是", "不可否认", "毋庸置疑", "总而言之", "综上所述", "在这个过程中", "从某种意义上说"]),
  softenerTerms: terms.default(["似乎", "仿佛", "某种", "一种", "难以言喻", "莫名", "隐隐"]),
  actionAdverbTerms: terms.default(["缓缓", "微微", "轻轻", "不禁", "下意识", "忍不住", "悄然"]),
  minSentenceCharacters: z.number().int().min(1).max(100).default(12),
  longSentenceCharacters: z.number().int().min(12).max(2000).default(80),
  commaCount: z.number().int().min(1).max(100).default(4),
  clusterCount: z.number().int().min(2).max(20).default(3),
  transitionRepeatCount: z.number().int().min(2).max(20).default(2),
  maxPerRule: z.number().int().min(1).max(2).default(2),
  maxFindings: z.number().int().min(1).max(8).default(8),
  excerptCharacters: z.number().int().min(24).max(240).default(160),
});
export type StyleSignalPolicy = z.infer<typeof styleSignalPolicySchema>;
export const createStyleSignalPolicy = (): StyleSignalPolicy => styleSignalPolicySchema.parse({ revision: "style-signals-v1" });

export const styleSignalFindingSchema = z.object({
  ruleId: z.enum(["template.transition", "rhythm.comma-density", "surface.repeated-softeners", "surface.action-adverb-stack"]),
  excerpt: z.string().min(1).max(480),
  from: z.number().int().nonnegative(),
  to: z.number().int().nonnegative(),
  matchedTerms: z.array(z.string()).max(32),
  hits: z.number().int().nonnegative(),
  characters: z.number().int().nonnegative(),
  commas: z.number().int().nonnegative(),
  matchFrom: z.number().int().nonnegative().optional(),
});
export type StyleSignalFinding = z.infer<typeof styleSignalFindingSchema>;
export const styleSignalScanSchema = z.object({
  policy: styleSignalPolicySchema,
  sourceContentHash: z.string(),
  coordinateSystem: z.literal("utf16-crlf-normalized"),
  findings: z.array(styleSignalFindingSchema).max(8),
});
export type StyleSignalScan = z.infer<typeof styleSignalScanSchema>;
