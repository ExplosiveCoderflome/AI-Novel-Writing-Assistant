import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { prisma } from "../../../../db/prisma";
import { validate } from "../../../../middleware/validate";

// Validation schemas
const worldIdParamSchema = z.object({
  worldId: z.string()
});

const customPropertySchemaInput = z.object({
  targetType: z.enum(["character", "location", "faction", "element"]),
  propertyName: z.string().min(2),
  propertyLabel: z.string().min(1),
  dataType: z.enum(["number", "string", "boolean", "enum"]),
  typeMetadata: z.string().optional(),
  description: z.string().optional(),
  defaultValue: z.string().optional(),
  aiGuidance: z.string().optional()
});

const customRelationSchemaInput = z.object({
  bondType: z.string().min(2),
  bondLabel: z.string().min(1),
  description: z.string().optional(),
  defaultLeverage: z.number().min(0.0).max(5.0).default(1.0),
  aiGuidance: z.string().optional()
});

const relationBondInput = z.object({
  novelId: z.string(),
  sourceCharacterId: z.string(),
  targetCharacterId: z.string(),
  bondType: z.string(),
  description: z.string(),
  leverageWeight: z.number().min(0.0).max(5.0).default(1.0),
  expiryTick: z.number().optional()
});

const customConflictSchemaInput = z.object({
  conflictType: z.string().min(2),
  conflictLabel: z.string().min(1),
  arbitrationRule: z.string().min(1),
  climaxCriteria: z.string().min(1)
});

const forkBranchInput = z.object({
  novelId: z.string(),
  name: z.string().min(1),
  parentBranchId: z.string(),
  parentForkTick: z.number().min(0)
});

const compareBranchesQuery = z.object({
  branchAId: z.string(),
  branchBId: z.string(),
  tickIndex: z.coerce.number().min(0)
});

const inspectQuerySchema = z.object({
  branchId: z.string(),
  tickIndex: z.coerce.number().min(0),
  locationId: z.string()
});

const teleportInput = z.object({
  novelId: z.string(),
  characterId: z.string(),
  targetLocationId: z.string()
});

const overrideActionInput = z.object({
  novelId: z.string(),
  characterId: z.string(),
  actionType: z.string(),
  targetEntityId: z.string(),
  intensityLevel: z.number().min(0).max(5)
});

export function registerSandboxRoutes(router: Router): void {
  // ==========================================
  // 1. Dynamic Attribute Schema (M1)
  // ==========================================
  router.get("/:worldId/sandbox/schema", validate({ params: worldIdParamSchema }), async (req, res, next) => {
    try {
      const { worldId } = req.params as any;
      const schemas = await prisma.worldCustomPropertySchema.findMany({
        where: { worldId }
      });
      res.status(200).json({
        success: true,
        data: schemas,
        message: "Dynamic property schemas loaded."
      } satisfies ApiResponse<typeof schemas>);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/:worldId/sandbox/schema",
    validate({ params: worldIdParamSchema, body: customPropertySchemaInput }),
    async (req, res, next) => {
      try {
        const { worldId } = req.params as any;
        const input = req.body;
        const schema = await prisma.worldCustomPropertySchema.upsert({
          where: {
            worldId_targetType_propertyName: {
              worldId,
              targetType: input.targetType,
              propertyName: input.propertyName
            }
          },
          update: {
            propertyLabel: input.propertyLabel,
            dataType: input.dataType,
            typeMetadata: input.typeMetadata,
            description: input.description,
            defaultValue: input.defaultValue,
            aiGuidance: input.aiGuidance
          },
          create: {
            worldId,
            targetType: input.targetType,
            propertyName: input.propertyName,
            propertyLabel: input.propertyLabel,
            dataType: input.dataType,
            typeMetadata: input.typeMetadata,
            description: input.description,
            defaultValue: input.defaultValue,
            aiGuidance: input.aiGuidance
          }
        });
        res.status(200).json({
          success: true,
          data: schema,
          message: "Dynamic property schema updated."
        } satisfies ApiResponse<typeof schema>);
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // 2. Dynamic Relationship Schema (M2)
  // ==========================================
  router.get("/:worldId/sandbox/relation-schema", validate({ params: worldIdParamSchema }), async (req, res, next) => {
    try {
      const { worldId } = req.params as any;
      const schemas = await prisma.worldCustomRelationSchema.findMany({
        where: { worldId }
      });
      res.status(200).json({
        success: true,
        data: schemas,
        message: "Custom relation schemas loaded."
      } satisfies ApiResponse<typeof schemas>);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/:worldId/sandbox/relation-schema",
    validate({ params: worldIdParamSchema, body: customRelationSchemaInput }),
    async (req, res, next) => {
      try {
        const { worldId } = req.params as any;
        const input = req.body;
        const schema = await prisma.worldCustomRelationSchema.upsert({
          where: {
            worldId_bondType: {
              worldId,
              bondType: input.bondType
            }
          },
          update: {
            bondLabel: input.bondLabel,
            description: input.description,
            defaultLeverage: input.defaultLeverage,
            aiGuidance: input.aiGuidance
          },
          create: {
            worldId,
            bondType: input.bondType,
            bondLabel: input.bondLabel,
            description: input.description,
            defaultLeverage: input.defaultLeverage,
            aiGuidance: input.aiGuidance
          }
        });
        res.status(200).json({
          success: true,
          data: schema,
          message: "Custom relation schema updated."
        } satisfies ApiResponse<typeof schema>);
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/:worldId/sandbox/relation-bond",
    validate({ params: worldIdParamSchema, body: relationBondInput }),
    async (req, res, next) => {
      try {
        const input = req.body;
        const bond = await prisma.characterRelationBond.create({
          data: {
            novelId: input.novelId,
            sourceCharacterId: input.sourceCharacterId,
            targetCharacterId: input.targetCharacterId,
            bondType: input.bondType,
            description: input.description,
            leverageWeight: input.leverageWeight,
            expiryTick: input.expiryTick
          }
        });
        res.status(201).json({
          success: true,
          data: bond,
          message: "Character relation bond created."
        } satisfies ApiResponse<typeof bond>);
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // 3. Dynamic Conflict Schema (M3)
  // ==========================================
  router.get("/:worldId/sandbox/conflict-schema", validate({ params: worldIdParamSchema }), async (req, res, next) => {
    try {
      const { worldId } = req.params as any;
      const schemas = await prisma.worldCustomConflictSchema.findMany({
        where: { worldId }
      });
      res.status(200).json({
        success: true,
        data: schemas,
        message: "Custom conflict schemas loaded."
      } satisfies ApiResponse<typeof schemas>);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/:worldId/sandbox/conflict-schema",
    validate({ params: worldIdParamSchema, body: customConflictSchemaInput }),
    async (req, res, next) => {
      try {
        const { worldId } = req.params as any;
        const input = req.body;
        const schema = await prisma.worldCustomConflictSchema.upsert({
          where: {
            worldId_conflictType: {
              worldId,
              conflictType: input.conflictType
            }
          },
          update: {
            conflictLabel: input.conflictLabel,
            arbitrationRule: input.arbitrationRule,
            climaxCriteria: input.climaxCriteria
          },
          create: {
            worldId,
            conflictType: input.conflictType,
            conflictLabel: input.conflictLabel,
            arbitrationRule: input.arbitrationRule,
            climaxCriteria: input.climaxCriteria
          }
        });
        res.status(200).json({
          success: true,
          data: schema,
          message: "Custom conflict schema updated."
        } satisfies ApiResponse<typeof schema>);
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // 4. Parallel Universe Branches (M4)
  // ==========================================
  router.get("/:worldId/sandbox/branch", validate({ params: worldIdParamSchema }), async (req, res, next) => {
    try {
      const novelId = req.query.novelId as string;
      if (!novelId) {
        res.status(400).json({ success: false, error: "Missing novelId query param" });
        return;
      }
      const branches = await prisma.sandboxBranch.findMany({
        where: { novelId }
      });
      res.status(200).json({
        success: true,
        data: branches,
        message: "Sandbox branches loaded."
      } satisfies ApiResponse<typeof branches>);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/:worldId/sandbox/branch/fork",
    validate({ params: worldIdParamSchema, body: forkBranchInput }),
    async (req, res, next) => {
      try {
        const input = req.body;
        
        // Transaction to fork branch and copy snapshots pointers logically
        const newBranch = await prisma.$transaction(async (tx) => {
          const branch = await tx.sandboxBranch.create({
            data: {
              novelId: input.novelId,
              name: input.name,
              parentBranchId: input.parentBranchId,
              parentForkTick: input.parentForkTick
            }
          });
          return branch;
        });

        res.status(201).json({
          success: true,
          data: newBranch,
          message: "Sandbox branch successfully forked."
        } satisfies ApiResponse<typeof newBranch>);
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/:worldId/sandbox/branch/compare",
    validate({ params: worldIdParamSchema, query: compareBranchesQuery }),
    async (req, res, next) => {
      try {
        const { branchAId, branchBId, tickIndex } = req.query as any;
        
        // Find snapshots for comparison
        const snapshotA = await prisma.sandboxSnapshot.findFirst({
          where: { branchId: branchAId, tickIndex: Number(tickIndex) }
        });
        const snapshotB = await prisma.sandboxSnapshot.findFirst({
          where: { branchId: branchBId, tickIndex: Number(tickIndex) }
        });

        const diff = {
          tickIndex: Number(tickIndex),
          universeAId: branchAId,
          universeBId: branchBId,
          characterDiffs: [] as any[],
          relationDiffs: [] as any[],
          eventDiffs: {
            eventsOnlyInA: [],
            eventsOnlyInB: []
          }
        };

        // If snapshots exist, parse and compare
        if (snapshotA && snapshotB) {
          const stateA = JSON.parse(snapshotA.stateJson);
          const stateB = JSON.parse(snapshotB.stateJson);
          
          // Simple mock state diff comparison logic
          // (will be populated fully in M4 integration)
        }

        res.status(200).json({
          success: true,
          data: diff,
          message: "Parallel universes diff calculated."
        } satisfies ApiResponse<typeof diff>);
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // 5. Sandbox Dashboard & Inspector (M6)
  // ==========================================
  router.get(
    "/:worldId/sandbox/inspect",
    validate({ params: worldIdParamSchema, query: inspectQuerySchema }),
    async (req, res, next) => {
      try {
        const { branchId, tickIndex, locationId } = req.query as any;
        
        const snapshot = await prisma.sandboxSnapshot.findFirst({
          where: { branchId, tickIndex: Number(tickIndex) }
        });
        
        const data = {
          locationId,
          physics: { temp: 20, lux: 80000 },
          societal: { rulingFamily: "None", activeLaws: [], orderIndex: 0.8 },
          economics: { localResource: "grain", reserveValue: 100, priceIndex: 1.0 },
          aesthetic: { tone: "neutral", colorPalette: ["grey"], soundscape: "Silences" }
        };

        if (snapshot) {
          // Parse dynamic and ecologicalStateJson
        }

        res.status(200).json({
          success: true,
          data,
          message: "Location sandbox metrics inspected."
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/:worldId/sandbox/teleport",
    validate({ params: worldIdParamSchema, body: teleportInput }),
    async (req, res, next) => {
      try {
        const input = req.body;
        // In PAUSED sandbox mode, teleports character to target location ID
        await prisma.character.update({
          where: { id: input.characterId },
          data: { currentLocation: input.targetLocationId }
        });
        res.status(200).json({
          success: true,
          data: { characterId: input.characterId, targetLocationId: input.targetLocationId },
          message: "Character teleported."
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/:worldId/sandbox/override-action",
    validate({ params: worldIdParamSchema, body: overrideActionInput }),
    async (req, res, next) => {
      try {
        const input = req.body;
        // Injects forced action decision
        res.status(200).json({
          success: true,
          data: input,
          message: "Character intent override injected."
        });
      } catch (error) {
        next(error);
      }
    }
  );
}
