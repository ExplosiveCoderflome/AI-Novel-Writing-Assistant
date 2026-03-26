import { z } from "zod";

const looseObjectSchema = z.record(z.string(), z.unknown());
const looseStringArraySchema = z.array(z.string().trim().min(1)).default([]);

const worldProfileSchema = z.object({
  summary: z.string().trim().optional(),
  identity: z.string().trim().optional(),
  tone: z.string().trim().optional(),
  themes: looseStringArraySchema.optional(),
  coreConflict: z.string().trim().optional(),
}).passthrough();

const worldRuleSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  summary: z.string().trim().optional(),
  cost: z.string().trim().optional(),
  boundary: z.string().trim().optional(),
  enforcement: z.string().trim().optional(),
}).passthrough();

const worldRulesSchema = z.object({
  summary: z.string().trim().optional(),
  axioms: z.array(worldRuleSchema).default([]),
  taboo: looseStringArraySchema.optional(),
  sharedConsequences: looseStringArraySchema.optional(),
}).passthrough();

const worldFactionSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  position: z.string().trim().optional(),
  doctrine: z.string().trim().optional(),
  goals: looseStringArraySchema.optional(),
  methods: looseStringArraySchema.optional(),
  representativeForceIds: looseStringArraySchema.optional(),
}).passthrough();

const worldForceSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  type: z.string().trim().optional(),
  factionId: z.string().trim().optional(),
  summary: z.string().trim().optional(),
  baseOfPower: z.string().trim().optional(),
  currentObjective: z.string().trim().optional(),
  pressure: z.string().trim().optional(),
  leader: z.string().trim().optional(),
  narrativeRole: z.string().trim().optional(),
}).passthrough();

const worldLocationSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  terrain: z.string().trim().optional(),
  summary: z.string().trim().optional(),
  narrativeFunction: z.string().trim().optional(),
  risk: z.string().trim().optional(),
  entryConstraint: z.string().trim().optional(),
  exitCost: z.string().trim().optional(),
  controllingForceIds: looseStringArraySchema.optional(),
}).passthrough();

const worldForceRelationSchema = z.object({
  id: z.string().trim().min(1).optional(),
  sourceForceId: z.string().trim().optional(),
  targetForceId: z.string().trim().optional(),
  relation: z.string().trim().optional(),
  tension: z.string().trim().optional(),
  detail: z.string().trim().optional(),
}).passthrough();

const worldLocationControlSchema = z.object({
  id: z.string().trim().min(1).optional(),
  forceId: z.string().trim().optional(),
  locationId: z.string().trim().optional(),
  relation: z.string().trim().optional(),
  detail: z.string().trim().optional(),
}).passthrough();

export const worldStructuredDataSchema = z.object({
  profile: worldProfileSchema,
  rules: worldRulesSchema,
  factions: z.array(worldFactionSchema),
  forces: z.array(worldForceSchema),
  locations: z.array(worldLocationSchema),
  relations: z.object({
    forceRelations: z.array(worldForceRelationSchema).default([]),
    locationControls: z.array(worldLocationControlSchema).default([]),
  }).passthrough(),
}).passthrough();

export const worldStructureSectionOutputSchema = z.union([
  looseObjectSchema,
  z.array(looseObjectSchema),
]);
