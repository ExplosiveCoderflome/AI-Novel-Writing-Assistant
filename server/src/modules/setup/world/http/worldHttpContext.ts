import type { RequestHandler } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { featureFlags } from "../../../../config/featureFlags";
import { llmProviderSchema } from "../../../../llm/providerSchema";
import { KnowledgeService } from "../../../../services/knowledge/KnowledgeService";
import { WorldService } from "../../../../services/world/WorldService";

export const worldService = new WorldService();
export const knowledgeService = new KnowledgeService();

export const requireWorldWizard: RequestHandler = (_req, res, next) => {
  if (featureFlags.worldWizardEnabled) {
    next();
    return;
  }
  res.status(404).json({
    success: false,
    error: "World wizard feature is disabled.",
  } satisfies ApiResponse<null>);
};

export const requireWorldVisualization: RequestHandler = (_req, res, next) => {
  if (featureFlags.worldVisEnabled) {
    next();
    return;
  }
  res.status(404).json({
    success: false,
    error: "World visualization feature is disabled.",
  } satisfies ApiResponse<null>);
};

const providerSchema = llmProviderSchema;

export const worldIdSchema = z.object({
  id: z.string().trim().min(1),
});

export const issueIdSchema = z.object({
  id: z.string().trim().min(1),
  issueId: z.string().trim().min(1),
});

export const layerParamsSchema = z.object({
  id: z.string().trim().min(1),
  layerKey: z.enum(["foundation", "power", "society", "culture", "history", "conflict"]),
});

export const libraryUseParamsSchema = z.object({
  libraryId: z.string().trim().min(1),
});

export const snapshotRestoreParamsSchema = z.object({
  id: z.string().trim().min(1),
  snapshotId: z.string().trim().min(1),
});

export const createWorldSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  worldType: z.string().trim().optional(),
  templateKey: z.string().trim().optional(),
  axioms: z.string().optional(),
  background: z.string().optional(),
  geography: z.string().optional(),
  cultures: z.string().optional(),
  magicSystem: z.string().optional(),
  politics: z.string().optional(),
  races: z.string().optional(),
  religions: z.string().optional(),
  technology: z.string().optional(),
  conflicts: z.string().optional(),
  history: z.string().optional(),
  economy: z.string().optional(),
  factions: z.string().optional(),
  selectedDimensions: z.string().optional(),
  selectedElements: z.string().optional(),
  knowledgeDocumentIds: z.array(z.string().trim().min(1)).optional(),
  structure: z.unknown().optional(),
  bindingSupport: z.unknown().optional(),
});

export const updateWorldSchema = createWorldSchema.partial();

export const worldGenerateSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  worldType: z.string().trim().min(1),
  complexity: z.enum(["simple", "standard", "detailed"]),
  dimensions: z.object({
    geography: z.boolean(),
    culture: z.boolean(),
    magicSystem: z.boolean(),
    technology: z.boolean(),
    history: z.boolean(),
  }),
  provider: providerSchema.optional(),
  model: z.string().optional(),
});

export const inspirationSchema = z.object({
  input: z.string().max(2_000_000).optional(),
  mode: z.enum(["free", "reference", "random"]).optional(),
  worldType: z.string().optional(),
  knowledgeDocumentIds: z.array(z.string().trim().min(1)).optional(),
  referenceMode: z.enum(["extract_base", "adapt_world", "tone_rebuild"]).optional(),
  preserveElements: z.array(z.string().trim().min(1)).optional(),
  allowedChanges: z.array(z.string().trim().min(1)).optional(),
  forbiddenElements: z.array(z.string().trim().min(1)).optional(),
  refinementLevel: z.enum(["basic", "standard", "detailed"]).optional(),
  optionsCount: z.number().int().min(4).max(8).optional(),
  provider: providerSchema.optional(),
  model: z.string().optional(),
});

export const knowledgeBindingsSchema = z.object({
  documentIds: z.array(z.string().trim().min(1)).default([]),
});

export const suggestAxiomsSchema = z.object({
  provider: providerSchema.optional(),
  model: z.string().optional(),
});

export const updateAxiomsSchema = z.object({
  axioms: z.array(z.string().trim().min(1)).min(1),
});

export const layerGenerateSchema = z.object({
  provider: providerSchema.optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export const layerUpdateSchema = z.object({
  content: z.string().trim().min(1),
});

export const deepeningQuestionSchema = z.object({
  provider: providerSchema.optional(),
  model: z.string().optional(),
});

export const deepeningAnswerSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().trim().min(1),
      answer: z.string().trim().min(1),
    }),
  ),
});

export const consistencyCheckSchema = z.object({
  provider: providerSchema.optional(),
  model: z.string().optional(),
});

export const consistencyIssuePatchSchema = z.object({
  status: z.enum(["open", "resolved", "ignored"]),
});

export const worldRefineSchema = z.object({
  attribute: z.enum([
    "description",
    "background",
    "geography",
    "cultures",
    "magicSystem",
    "politics",
    "races",
    "religions",
    "technology",
    "conflicts",
    "history",
    "economy",
    "factions",
  ]),
  currentValue: z.string().trim().min(1),
  refinementLevel: z.enum(["light", "deep"]),
  mode: z.enum(["replace", "alternatives"]).optional(),
  alternativesCount: z.number().int().min(2).max(3).optional(),
  provider: providerSchema.optional(),
  model: z.string().optional(),
});

export const libraryListQuerySchema = z.object({
  category: z.string().optional(),
  worldType: z.string().optional(),
  keyword: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const libraryCreateSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
  category: z.string().trim().min(1),
  worldType: z.string().optional(),
  sourceWorldId: z.string().optional(),
});

export const libraryUseSchema = z.object({
  worldId: z.string().optional(),
  targetField: z.enum([
    "description",
    "background",
    "geography",
    "cultures",
    "magicSystem",
    "politics",
    "races",
    "religions",
    "technology",
    "conflicts",
    "history",
    "economy",
    "factions",
  ]).optional(),
  targetCollection: z.enum(["forces", "locations"]).optional(),
});

const structureSectionSchema = z.enum(["profile", "rules", "factions", "locations", "relations"]);

export const structureUpdateSchema = z.object({
  structure: z.unknown(),
  bindingSupport: z.unknown().optional(),
});

export const structureBackfillSchema = z.object({
  provider: providerSchema.optional(),
  model: z.string().optional(),
});

export const structureGenerateSchema = z.object({
  section: structureSectionSchema,
  structure: z.unknown().optional(),
  bindingSupport: z.unknown().optional(),
  provider: providerSchema.optional(),
  model: z.string().optional(),
});

export const snapshotCreateSchema = z.object({
  label: z.string().optional(),
});

export const snapshotDiffQuerySchema = z.object({
  from: z.string().trim().min(1),
  to: z.string().trim().min(1),
});

export const worldExportQuerySchema = z.object({
  format: z.enum(["markdown", "json"]).default("markdown"),
});

export const worldImportSchema = z.object({
  format: z.enum(["json", "markdown", "text"]),
  content: z.string().trim().min(1),
  name: z.string().optional(),
  provider: providerSchema.optional(),
  model: z.string().optional(),
});
