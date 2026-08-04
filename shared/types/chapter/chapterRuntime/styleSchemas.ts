import { z } from "zod";

const styleBindingTargetTypeSchema = z.enum(["novel", "chapter", "task"]);
const styleContractSectionKeySchema = z.enum(["narrative", "character", "language", "rhythm", "antiAi", "selfCheck"]);
const styleContractMaturitySchema = z.enum(["structured", "summary_only"]);

export const runtimeStyleRuleBlockSchema = z.record(z.string(), z.unknown());

export const runtimeStyleContractSectionSchema = z.object({
  key: styleContractSectionKeySchema,
  title: z.string(),
  summary: z.string().nullable().optional(),
  lines: z.array(z.string()).default([]),
  text: z.string(),
  hasContent: z.boolean(),
});

export const runtimeStyleContractSchema = z.object({
  narrative: runtimeStyleContractSectionSchema,
  character: runtimeStyleContractSectionSchema,
  language: runtimeStyleContractSectionSchema,
  rhythm: runtimeStyleContractSectionSchema,
  antiAi: runtimeStyleContractSectionSchema,
  selfCheck: runtimeStyleContractSectionSchema,
  meta: z.object({
    effectiveStyleProfileId: z.string().nullable().optional(),
    taskStyleProfileId: z.string().nullable().optional(),
    activeSourceTargets: z.array(styleBindingTargetTypeSchema).default([]),
    activeSourceLabels: z.array(z.string()).default([]),
    writerIncludedSections: z.array(styleContractSectionKeySchema).default([]),
    plannerIncludedSections: z.array(styleContractSectionKeySchema).default([]),
    droppedSections: z.array(styleContractSectionKeySchema).default([]),
    maturity: styleContractMaturitySchema,
    usesGlobalAntiAiBaseline: z.boolean(),
    globalAntiAiRuleIds: z.array(z.string()).default([]),
    styleAntiAiRuleIds: z.array(z.string()).default([]),
  }),
});

export const runtimeCompiledStylePromptBlocksSchema = z.object({
  context: z.string(),
  style: z.string(),
  character: z.string(),
  antiAi: z.string(),
  output: z.string(),
  selfCheck: z.string(),
  contract: runtimeStyleContractSchema,
  mergedRules: z.object({
    narrativeRules: runtimeStyleRuleBlockSchema,
    characterRules: runtimeStyleRuleBlockSchema,
    languageRules: runtimeStyleRuleBlockSchema,
    rhythmRules: runtimeStyleRuleBlockSchema,
  }),
  appliedRuleIds: z.array(z.string()),
});

export const runtimeStyleProfileSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
});

export const runtimeStyleBindingSchema = z.object({
  id: z.string(),
  styleProfileId: z.string(),
  targetType: styleBindingTargetTypeSchema,
  targetId: z.string(),
  priority: z.number().int(),
  weight: z.number(),
  enabled: z.boolean(),
  styleProfile: runtimeStyleProfileSummarySchema.optional(),
});

export const runtimeStyleContextSchema = z.object({
  matchedBindings: z.array(runtimeStyleBindingSchema),
  compiledBlocks: runtimeCompiledStylePromptBlocksSchema.nullable(),
  effectiveStyleProfileId: z.string().nullable().optional(),
  taskStyleProfileId: z.string().nullable().optional(),
  activeSourceTargets: z.array(styleBindingTargetTypeSchema).default([]),
  activeSourceLabels: z.array(z.string()).default([]),
  maturity: styleContractMaturitySchema.optional(),
  usesGlobalAntiAiBaseline: z.boolean().optional(),
  globalAntiAiRuleIds: z.array(z.string()).default([]),
  styleAntiAiRuleIds: z.array(z.string()).default([]),
  sanitizedGenerationProfile: z.object({
    writingGuidance: z.array(z.string()).default([]),
    forbiddenEntities: z.array(z.string()).default([]),
    sourceProfileNames: z.array(z.string()).default([]),
    sanitizedAt: z.string(),
    strategy: z.enum(["deterministic", "llm"]),
  }).nullable().optional(),
});

export type RuntimeStyleContractSection = z.infer<typeof runtimeStyleContractSectionSchema>;
export type RuntimeStyleContract = z.infer<typeof runtimeStyleContractSchema>;
export type RuntimeCompiledStylePromptBlocks = z.infer<typeof runtimeCompiledStylePromptBlocksSchema>;
export type RuntimeStyleBinding = z.infer<typeof runtimeStyleBindingSchema>;
export type RuntimeStyleContext = z.infer<typeof runtimeStyleContextSchema>;
