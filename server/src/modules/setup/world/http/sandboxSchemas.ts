import { z } from "zod";

export const worldIdParamSchema = z.object({
  worldId: z.string(),
});

export const customPropertySchemaInput = z.object({
  targetType: z.enum(["character", "location", "faction", "element"]),
  propertyName: z.string().min(2),
  propertyLabel: z.string().min(1),
  dataType: z.enum(["number", "string", "boolean", "enum"]),
  typeMetadata: z.string().optional(),
  description: z.string().optional(),
  defaultValue: z.string().optional(),
  aiGuidance: z.string().optional(),
});

export const customRelationSchemaInput = z.object({
  bondType: z.string().min(2),
  bondLabel: z.string().min(1),
  description: z.string().optional(),
  defaultLeverage: z.number().min(0.0).max(5.0).default(1.0),
  aiGuidance: z.string().optional(),
});

export const relationBondInput = z.object({
  novelId: z.string(),
  sourceCharacterId: z.string(),
  targetCharacterId: z.string(),
  bondType: z.string(),
  description: z.string(),
  leverageWeight: z.number().min(0.0).max(5.0).default(1.0),
  expiryTick: z.number().optional(),
});

export const customConflictSchemaInput = z.object({
  conflictType: z.string().min(2),
  conflictLabel: z.string().min(1),
  arbitrationRule: z.string().min(1),
  climaxCriteria: z.string().min(1),
});

export const forkBranchInput = z.object({
  novelId: z.string(),
  name: z.string().min(1),
  parentBranchId: z.string(),
  parentForkTick: z.number().min(0),
});
