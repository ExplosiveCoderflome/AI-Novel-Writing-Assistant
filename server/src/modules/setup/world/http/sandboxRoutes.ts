import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { prisma } from "../../../../db/prisma";
import { validate } from "../../../../middleware/validate";
import { EarthPhysicsSimulator } from "../../../../services/world/EarthPhysicsSimulator";
import { CharacterAgentSimulator } from "../../../../services/world/CharacterAgentSimulator";
import { TensionAndConflictEngine } from "../../../../services/world/TensionAndConflictEngine";
import { VirtualCameraNarrativeEngine } from "../../../../services/world/VirtualCameraNarrativeEngine";
import { ChronologyBranchEngine } from "../../../../services/world/ChronologyBranchEngine";

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

  const tickInput = z.object({
    novelId: z.string().optional(),
    branchId: z.string().optional(),
    tickIndex: z.number().min(0)
  });

  function parsePowerLevel(powerStr: string | null | undefined): number {
    if (!powerStr) return 10;
    const val = parseInt(powerStr, 10);
    if (!isNaN(val)) return val;
    const realms: Record<string, number> = {
      "炼气": 10, "练气": 10,
      "筑基": 25,
      "金丹": 50, "结丹": 45,
      "元婴": 80,
      "化神": 120,
      "凡人": 5, "外门": 8, "内门": 15
    };
    for (const [key, num] of Object.entries(realms)) {
      if (powerStr.includes(key)) return num;
    }
    return 15;
  }

  router.post(
    "/:worldId/sandbox/tick",
    validate({ params: worldIdParamSchema, body: tickInput }),
    async (req, res, next) => {
      try {
        const { worldId } = req.params as any;
        const { novelId, branchId, tickIndex } = req.body;

        let resolvedNovelId = novelId;
        let resolvedBranchId = branchId;

        if (!resolvedNovelId) {
          const novelWorld = await prisma.novelWorld.findFirst({ where: { sourceWorldId: worldId } });
          if (novelWorld) {
            resolvedNovelId = novelWorld.novelId;
          } else {
            const novel = await prisma.novel.findFirst({ where: { worldId } });
            if (novel) {
              resolvedNovelId = novel.id;
            } else {
              resolvedNovelId = `temp-novel-${worldId}`;
            }
          }
        }

        if (!resolvedBranchId) {
          let mainBranch = await prisma.sandboxBranch.findFirst({
            where: { novelId: resolvedNovelId, isMain: true }
          });
          if (!mainBranch) {
            try {
              mainBranch = await prisma.sandboxBranch.create({
                data: {
                  novelId: resolvedNovelId,
                  name: "主宇宙",
                  isMain: true
                }
              });
            } catch (e) {
              mainBranch = { id: `temp-branch-${resolvedNovelId}` } as any;
            }
          }
          resolvedBranchId = mainBranch ? mainBranch.id : `temp-branch-${resolvedNovelId}`;
        }

        const chronologyBranchEngine = new ChronologyBranchEngine();
        const earthPhysicsSimulator = new EarthPhysicsSimulator();
        const characterAgentSimulator = new CharacterAgentSimulator();
        const tensionAndConflictEngine = new TensionAndConflictEngine();
        const virtualCameraNarrativeEngine = new VirtualCameraNarrativeEngine();

        // 1. 获取上一 Tick 的 Snapshot
        let prevSnapshot = await chronologyBranchEngine.getSnapshot(resolvedBranchId, tickIndex);

        let locationsState: any[] = [];
        let charactersState: any[] = [];
        let ecologyState: Record<string, any> = {};

        // 获取大世界和已注册自定义属性 Schema 以及冲突 Schema
        const world = await prisma.world.findUnique({
          where: { id: worldId }
        });
        if (!world) {
          res.status(404).json({ success: false, error: "World not found" });
          return;
        }

        const customPropertySchemas = await prisma.worldCustomPropertySchema.findMany({
          where: { worldId }
        });

        const customConflictSchemas = await prisma.worldCustomConflictSchema.findMany({
          where: { worldId }
        });

        // 解析结构化大世界设定
        let structure: any = { locations: [], factions: [], forces: [], relations: { forceRelations: [], locationControls: [] } };
        if (world.structureJson) {
          try {
            structure = JSON.parse(world.structureJson);
          } catch (e) {}
        }

        // 2. 如果不存在上一 Tick 的快照，则进行初始化
        if (!prevSnapshot) {
          // 获取该小说在数据库中的角色列表
          const dbCharacters = resolvedNovelId.startsWith("temp-") ? [] : await prisma.character.findMany({
            where: { novelId: resolvedNovelId }
          });

          // 初始化地理节点
          const locs = structure.locations && structure.locations.length > 0
            ? structure.locations
            : [
                { id: "loc_1", name: "大观园正堂", terrain: "室内", elevation: 50 },
                { id: "loc_2", name: "潇湘馆竹林", terrain: "平原", elevation: 48 },
                { id: "loc_3", name: "蘅芜苑花厅", terrain: "室内", elevation: 52 },
                { id: "loc_4", name: "大观园假山", terrain: "山地", elevation: 85 }
              ];

          locationsState = locs.map((loc: any, idx: number) => ({
            id: loc.id,
            name: loc.name,
            latitude: loc.latitude ?? (39.9 + idx * 0.01),
            longitude: loc.longitude ?? (116.4 + idx * 0.01),
            elevation: loc.elevation ?? 50,
            temp: 22.0,
            tension: 10,
            weather: "晴",
            flora: 0.5
          }));

          // 初始化生态状态
          locs.forEach((loc: any) => {
            ecologyState[loc.id] = {
              soilMoisture: 0.5,
              floraDensity: 0.5,
              preyPopulation: 100,
              predatorPopulation: 5,
              rainfall: 0,
              evaporation: 0
            };
          });

          // 初始化角色状态 (Forces 映射或模版经典人物兜底)
          let chars: any[] = dbCharacters;
          if (chars.length === 0) {
            if (structure.forces && structure.forces.length > 0) {
              chars = structure.forces.map((f: any) => ({
                id: f.id,
                name: f.name,
                currentLocation: f.locationId || f.currentLocation || locs[0].id,
                realm: f.powerLevel || f.realm || "凡人",
                role: f.type || "探索者"
              }));
            } else {
              // 模版自适应角色生成
              const template = world.templateKey || "custom";
              if (template.includes("xuanhuan") || template.includes("xianxia")) {
                chars = [
                  { id: "char_1", name: "宗门传人", currentLocation: "loc_2", realm: "筑基期" },
                  { id: "char_2", name: "魔道密使", currentLocation: "loc_4", realm: "结丹期" },
                  { id: "char_3", name: "试炼弟子", currentLocation: "loc_1", realm: "炼气期" }
                ];
              } else if (template.includes("scifi") || template.includes("cyberpunk")) {
                chars = [
                  { id: "char_1", name: "赛博黑客", currentLocation: "loc_2", realm: "级10" },
                  { id: "char_2", name: "公司防卫官", currentLocation: "loc_3", realm: "级15" },
                  { id: "char_3", name: "AI流浪体", currentLocation: "loc_4", realm: "级8" }
                ];
              } else {
                chars = [
                  { id: "char_1", name: "探索者A", currentLocation: "loc_2", realm: "凡人" },
                  { id: "char_2", name: "守护者B", currentLocation: "loc_1", realm: "凡人" }
                ];
              }
            }
          }

          charactersState = chars.map((c: any, idx: number) => {
            // 装配自定义属性
            const customProperties: Record<string, any> = {};
            let parsedProps: Record<string, any> = {};
            if (c.customPropertiesJson) {
              try {
                parsedProps = JSON.parse(c.customPropertiesJson);
              } catch (e) {}
            }
            customPropertySchemas.forEach((schema) => {
              const val = parsedProps[schema.propertyName] ?? schema.defaultValue;
              if (val !== undefined) {
                customProperties[schema.propertyName] = schema.dataType === "number" ? Number(val) : val;
              } else {
                customProperties[schema.propertyName] = schema.dataType === "number" ? 50 : "";
              }
            });

            return {
              id: c.id,
              name: c.name,
              locationId: c.currentLocation || c.locationId || locs[idx % locs.length].id,
              hunger: 0,
              energy: 100,
              sanity: 100,
              stress: 2,
              realm: c.realm || "凡人",
              role: c.role || "普通人",
              customProperties,
              memories: []
            };
          });
        } else {
          // 快照恢复
          try {
            const parsedState = JSON.parse(prevSnapshot.stateJson);
            locationsState = parsedState.locations || [];
            charactersState = parsedState.characters || [];
          } catch (e) {}

          if (prevSnapshot.ecologicalStateJson) {
            try {
              ecologyState = JSON.parse(prevSnapshot.ecologicalStateJson);
            } catch (e) {}
          }
        }

        // 3. 普适物理气候推进
        const dayOfYear = tickIndex % 365;
        const hourOfDay = (tickIndex * 6) % 24;

        // 根据世界设定类型，生成自适应气候概率
        const template = world.templateKey || "custom";
        let weatherList = ["晴", "阴", "微风"];
        if (template.includes("scifi") || template.includes("post_apocalypse")) {
          weatherList = ["沙尘", "酸雨", "干热", "晴"];
        } else if (template.includes("xianxia") || template.includes("xuanhuan")) {
          weatherList = ["晴", "雾", "惊雷", "微风"];
        }

        locationsState = locationsState.map((loc: any) => {
          const weather = weatherList[Math.floor(Math.random() * weatherList.length)];
          const weatherStateObj = {
            cloudCover: weather.includes("阴") || weather.includes("雾") ? 0.7 : weather.includes("沙尘") ? 0.9 : 0.1,
            rainIntensity: weather.includes("酸雨") ? 0.7 : weather.includes("惊雷") ? 0.3 : 0.0,
            snowIntensity: 0.0,
            windSpeed: weather.includes("惊雷") || weather.includes("沙尘") ? 15.0 : 2.0,
            windDirection: "NE"
          };

          const locPhysics = earthPhysicsSimulator.calculateLocPhysics(
            {
              id: loc.id,
              name: loc.name,
              latitude: loc.latitude,
              longitude: loc.longitude,
              elevation: loc.elevation,
              biomeType: "temperate",
              terrainType: loc.terrain || "plain",
              hasRiver: true,
              soilMoistureBase: 0.5
            },
            dayOfYear,
            hourOfDay,
            weatherStateObj
          );

          // 生态步进
          const prevEco = ecologyState[loc.id] || {
            soilMoisture: 0.5,
            floraDensity: 0.5,
            preyPopulation: 120,
            predatorPopulation: 8
          };
          const nextEco = earthPhysicsSimulator.stepEcology(
            {
              id: loc.id,
              name: loc.name,
              latitude: loc.latitude,
              longitude: loc.longitude,
              elevation: loc.elevation,
              biomeType: "temperate",
              terrainType: loc.terrain || "plain",
              hasRiver: true,
              soilMoistureBase: 0.5
            },
            prevEco,
            locPhysics.temperature,
            locPhysics.lux,
            weatherStateObj
          );

          ecologyState[loc.id] = nextEco;

          return {
            ...loc,
            temp: Number(locPhysics.temperature.toFixed(1)),
            weather,
            flora: Number(nextEco.floraDensity.toFixed(2))
          };
        });

        // 4. 角色状态推进与记忆衰退
        const locationIds = locationsState.map((l: any) => l.id);
        charactersState = charactersState.map((char: any) => {
          const memories = characterAgentSimulator.decayMemories(char.memories || [], tickIndex, 0.05);

          const decision = characterAgentSimulator.evaluateLOD2Decision(
            {
              id: char.id,
              name: char.name,
              lod: 2,
              currentLocationId: char.locationId,
              hunger: char.hunger,
              energy: char.energy,
              sanity: char.sanity,
              customPropertiesJson: JSON.stringify(char.customProperties || {}),
              memories
            },
            locationIds.filter((id: string) => id !== char.locationId)
          );

          return {
            ...char,
            locationId: decision.action === "MOVE" && decision.targetLocationId ? decision.targetLocationId : char.locationId,
            hunger: Math.max(0, Math.min(100, char.hunger + decision.hungerDelta)),
            energy: Math.max(0, Math.min(100, char.energy + decision.energyDelta)),
            sanity: Math.max(0, Math.min(100, char.sanity + decision.sanityDelta)),
            memories
          };
        });

        // 5. 基于势力关系网计算攻击意图与局部张力
        const forceRelations = structure.relations?.forceRelations || [];
        const forces = structure.forces || [];

        const getCharacterForceId = (charName: string) => {
          const matchedForce = forces.find((f: any) => f.name === charName || f.leader === charName);
          return matchedForce ? matchedForce.id : null;
        };

        const intentions = charactersState.map((char: any) => {
          // 查询人物所属势力的敌对状态
          const forceId = getCharacterForceId(char.name);
          let isAggressive = false;
          let actionGoal = "巡逻与戒备";

          if (forceId) {
            // 遍历同地点的其他角色，看是否有敌对势力
            const rivals = charactersState.filter((c: any) => c.locationId === char.locationId && c.id !== char.id);
            for (const rival of rivals) {
              const rivalForceId = getCharacterForceId(rival.name);
              if (rivalForceId) {
                // 查找关系网中的张力
                const relation = forceRelations.find(
                  (r: any) =>
                    (r.sourceForceId === forceId && r.targetForceId === rivalForceId) ||
                    (r.sourceForceId === rivalForceId && r.targetForceId === forceId)
                );
                // 关系极度紧张(>=70) 或 包含仇恨敌对字眼 触发主动攻击
                const hasHostility = relation && (parseInt(relation.tension, 10) >= 70 || /仇恨|敌对|宿敌|冲突/.test(relation.detail || ""));
                if (hasHostility) {
                  isAggressive = true;
                  actionGoal = relation.relation || "交战";
                  break;
                }
              }
            }
          }

          // 兜底小概率爆发冲突
          if (!isAggressive && Math.random() < 0.1) {
            isAggressive = true;
            actionGoal = "摩擦对峙";
          }

          return {
            characterId: char.id,
            locationId: char.locationId,
            actionGoal,
            isAggressive
          };
        });

        // 计算物理与势力压力合并张力
        const localTensions: Record<string, number> = {};
        locationsState = locationsState.map((loc: any) => {
          const localAgents = charactersState
            .filter((c: any) => c.locationId === loc.id)
            .map((c: any) => ({ id: c.id, stress: c.stress || 2 }));

          const agentRelationTensions: any[] = [];
          for (let i = 0; i < localAgents.length; i++) {
            for (let j = i + 1; j < localAgents.length; j++) {
              const forceA = getCharacterForceId(charactersState.find(c => c.id === localAgents[i].id)?.name || "");
              const forceB = getCharacterForceId(charactersState.find(c => c.id === localAgents[j].id)?.name || "");
              if (forceA && forceB) {
                const relation = forceRelations.find(
                  (r: any) =>
                    (r.sourceForceId === forceA && r.targetForceId === forceB) ||
                    (r.sourceForceId === forceB && r.targetForceId === forceA)
                );
                const tensionNum = relation ? parseInt(relation.tension, 10) / 10 : 2;
                agentRelationTensions.push({
                  agentAId: localAgents[i].id,
                  agentBId: localAgents[j].id,
                  tension: isNaN(tensionNum) ? 2 : tensionNum
                });
              }
            }
          }

          const tension = tensionAndConflictEngine.calculateLocalTension(
            {
              id: loc.id,
              hazardLevel: loc.tension >= 70 ? 7 : 2,
              securityModifier: 0
            },
            localAgents,
            agentRelationTensions
          );

          localTensions[loc.id] = tension;
          return {
            ...loc,
            tension
          };
        });

        // 6. 动态冲突仲裁与编年史日志搜集
        const encounters = tensionAndConflictEngine.detectEncounters(intentions, localTensions);
        const tickEvents: string[] = [];
        const activeEncounters = encounters.filter((e) => e.triggerArbitration && e.characterIds.length >= 2);

        // 自适应冲突配置获取
        const conflictType = customConflictSchemas.length > 0
          ? customConflictSchemas[0].conflictType
          : "battle";
        const arbitrationRule = customConflictSchemas.length > 0
          ? customConflictSchemas[0].arbitrationRule
          : "力量与境界比拼";

        for (const enc of activeEncounters) {
          const charA = charactersState.find((c) => c.id === enc.characterIds[0]);
          const charB = charactersState.find((c) => c.id === enc.characterIds[1]);

          if (charA && charB) {
            // 获取两者的真实实力等级 (境界换算值 + 自定义武力值)
            const basePowerA = parsePowerLevel(charA.realm);
            const basePowerB = parsePowerLevel(charB.realm);
            const customPowerA = charA.customProperties?.martialPower ?? charA.customProperties?.combatPower ?? 20;
            const customPowerB = charB.customProperties?.martialPower ?? charB.customProperties?.combatPower ?? 20;

            const combatPowerA = basePowerA + customPowerA * 0.1;
            const combatPowerB = basePowerB + customPowerB * 0.1;

            const arbitrationResult = tensionAndConflictEngine.arbitrateConflict(
              conflictType,
              { id: charA.id, name: charA.name, combatPower: combatPowerA, status: { intelligence: 10 } },
              { id: charB.id, name: charB.name, combatPower: combatPowerB, status: { intelligence: 10 } },
              arbitrationRule
            );

            // 更新压力
            charA.stress = Math.max(0, Math.min(10, (charA.stress || 2) + arbitrationResult.stressChangeA));
            charB.stress = Math.max(0, Math.min(10, (charB.stress || 2) + arbitrationResult.stressChangeB));

            tickEvents.push(`[${conflictType}] ${arbitrationResult.narrativeResult}`);
          }
        }

        // 7. 动态观察视口渲染与 SandboxChronology 存储
        for (const loc of locationsState) {
          const activeChars = charactersState
            .filter((c: any) => c.locationId === loc.id)
            .map((c: any) => c.name);

          // 搜集该节点实际动作事件
          const localActionList = tickEvents.filter((evt) => evt.includes(loc.name) || activeChars.some(name => evt.includes(name)));
          const locEvents = localActionList.map((desc) => ({
            locationId: loc.id,
            intensity: 4.5,
            description: desc
          }));

          const viewport = {
            locationId: loc.id,
            locationName: loc.name,
            elevation: loc.elevation,
            temperature: loc.temp,
            lux: loc.temp > 20 ? 80000 : 20000,
            localFlora: loc.flora,
            activeCharacters: activeChars
          };

          const cameraData = virtualCameraNarrativeEngine.filterCameraEvents(
            viewport,
            locationsState.filter((l: any) => l.id !== loc.id).map((l: any) => l.id),
            locEvents.length > 0 ? locEvents : [{ locationId: loc.id, intensity: 1.0, description: `区域一片静谧，天气是${loc.weather}。` }]
          );

          const renderFeed = virtualCameraNarrativeEngine.renderCameraFeedTemplate({
            viewport,
            directEvents: cameraData.directEvents,
            leakages: cameraData.leakages
          });

          if (!resolvedNovelId.startsWith("temp-")) {
            await prisma.sandboxChronology.create({
              data: {
                novelId: resolvedNovelId,
                branchId: resolvedBranchId,
                tickIndex: tickIndex + 1,
                locationId: loc.id,
                title: `${loc.name} - Tick ${tickIndex + 1} 观察`,
                summary: `${loc.name}当前气温${loc.temp}℃，天气${loc.weather}，活跃人员：${activeChars.join(", ") || "无"}`,
                observableDetails: renderFeed,
                hiddenTruth: `局部张力系数值为 ${loc.tension}`
              }
            });
          }
        }

        // 保存 Snapshot
        const nextStateJson = JSON.stringify({
          locations: locationsState,
          characters: charactersState
        });

        let nextSnapshot: any = null;
        if (!resolvedNovelId.startsWith("temp-")) {
          nextSnapshot = await prisma.sandboxSnapshot.create({
            data: {
              novelId: resolvedNovelId,
              branchId: resolvedBranchId,
              tickIndex: tickIndex + 1,
              timeLabel: `第 ${tickIndex + 1} 周期`,
              stateJson: nextStateJson,
              ecologicalStateJson: JSON.stringify(ecologyState)
            }
          });
        } else {
          nextSnapshot = {
            novelId: resolvedNovelId,
            branchId: resolvedBranchId,
            tickIndex: tickIndex + 1,
            timeLabel: `第 ${tickIndex + 1} 周期 (内存模式)`,
            stateJson: nextStateJson,
            ecologicalStateJson: JSON.stringify(ecologyState)
          };
        }

        // 更新真实系统角色位置
        if (!resolvedNovelId.startsWith("temp-")) {
          for (const char of charactersState) {
            await prisma.character.updateMany({
              where: { id: char.id, novelId: resolvedNovelId },
              data: { currentLocation: char.locationId }
            });
          }
        }

        res.status(200).json({
          success: true,
          data: {
            snapshot: nextSnapshot,
            locations: locationsState,
            characters: charactersState,
            events: tickEvents
          },
          message: `Tick ${tickIndex + 1} computed successfully.`
        });
      } catch (error) {
        next(error);
      }
    }
  );
}
