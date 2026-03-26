import { z } from "zod";

export const worldAxiomSuggestionSchema = z.array(z.string().trim()).max(5);

export const worldConceptCardSchema = z.object({
  worldType: z.string().trim().min(1),
  templateKey: z.string().trim().min(1),
  coreImagery: z.array(z.string().trim().min(1)),
  tone: z.string().trim().min(1),
  keywords: z.array(z.string().trim().min(1)),
  summary: z.string().trim().min(1),
}).passthrough();

const worldPropertyChoiceSchema = z.object({
  id: z.string().trim().optional(),
  label: z.string().trim().min(1),
  summary: z.string().trim().min(1),
}).passthrough();

const worldPropertyOptionSchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  targetLayer: z.union([
    z.enum(["foundation", "power", "society", "culture", "history", "conflict"]),
    z.string().trim().min(1),
  ]),
  reason: z.string().trim().optional().nullable(),
  choices: z.array(worldPropertyChoiceSchema).optional(),
}).passthrough();

export const worldPropertyOptionsPayloadSchema = z.object({
  options: z.array(worldPropertyOptionSchema),
}).passthrough();

export const worldDeepeningQuestionsSchema = z.array(z.object({
  priority: z.enum(["required", "recommended", "optional"]).optional(),
  question: z.string().trim().optional(),
  quickOptions: z.array(z.string().trim()).optional(),
  targetLayer: z.union([
    z.enum(["foundation", "power", "society", "culture", "history", "conflict"]),
    z.string().trim().min(1),
  ]).optional(),
  targetField: z.string().trim().optional(),
}).passthrough());

export const worldConsistencyIssuesSchema = z.array(z.object({
  severity: z.enum(["warn", "error"]).optional(),
  code: z.string().trim().optional(),
  message: z.string().trim().optional(),
  detail: z.string().trim().optional(),
  targetField: z.string().trim().optional(),
}).passthrough());

export const worldLooseObjectSchema = z.record(z.string(), z.unknown());

export const worldImportExtractionSchema = z.object({
  name: z.string().trim().optional(),
  description: z.string().trim().optional().nullable(),
  worldType: z.string().trim().optional().nullable(),
  templateKey: z.string().trim().optional().nullable(),
  axioms: z.union([z.string().trim(), z.array(z.string().trim())]).optional(),
  background: z.string().trim().optional().nullable(),
  geography: z.string().trim().optional().nullable(),
  cultures: z.string().trim().optional().nullable(),
  magicSystem: z.string().trim().optional().nullable(),
  politics: z.string().trim().optional().nullable(),
  races: z.string().trim().optional().nullable(),
  religions: z.string().trim().optional().nullable(),
  technology: z.string().trim().optional().nullable(),
  conflicts: z.string().trim().optional().nullable(),
  history: z.string().trim().optional().nullable(),
  economy: z.string().trim().optional().nullable(),
  factions: z.string().trim().optional().nullable(),
  selectedElements: z.string().trim().optional().nullable(),
}).passthrough();
