import type {
  CharacterCastApplyResult,
  CharacterCastOption,
  CharacterCastRole,
  CharacterRelation,
} from "@ai-novel/shared/types/novel";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../../db/prisma";
import { invokeStructuredLlm } from "../../../llm/structuredInvoke";
import { NovelContextService } from "../NovelContextService";
import { CharacterDynamicsService } from "../dynamics/CharacterDynamicsService";
import { characterCastOptionResponseSchema } from "./characterPreparationSchemas";

interface CharacterPrepOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  storyInput?: string;
}

const CHARACTER_CAST_OPTION_RESPONSE_TEMPLATE = `{
  "options": [
    {
      "title": "string",
      "summary": "string",
      "whyItWorks": "string",
      "recommendedReason": "string",
      "members": [
        {
          "name": "string",
          "role": "string",
          "castRole": "protagonist",
          "relationToProtagonist": "string",
          "storyFunction": "string",
          "shortDescription": "string",
          "outerGoal": "string",
          "innerNeed": "string",
          "fear": "string",
          "wound": "string",
          "misbelief": "string",
          "secret": "string",
          "moralLine": "string",
          "firstImpression": "string"
        }
      ],
      "relations": [
        {
          "sourceName": "string",
          "targetName": "string",
          "surfaceRelation": "string",
          "hiddenTension": "string",
          "conflictSource": "string",
          "secretAsymmetry": "string",
          "dynamicLabel": "string",
          "nextTurnPoint": "string"
        }
      ]
    }
  ]
}`;

export class CharacterPreparationService {
  private readonly novelContextService = new NovelContextService();
  private readonly characterDynamicsService = new CharacterDynamicsService();

  async listCharacterRelations(novelId: string): Promise<CharacterRelation[]> {
    const rows = await prisma.characterRelation.findMany({
      where: { novelId },
      include: {
        sourceCharacter: { select: { name: true } },
        targetCharacter: { select: { name: true } },
      },
      orderBy: [
        { updatedAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    return rows.map((row) => ({
      id: row.id,
      novelId: row.novelId,
      sourceCharacterId: row.sourceCharacterId,
      targetCharacterId: row.targetCharacterId,
      sourceCharacterName: row.sourceCharacter.name,
      targetCharacterName: row.targetCharacter.name,
      surfaceRelation: row.surfaceRelation,
      hiddenTension: row.hiddenTension,
      conflictSource: row.conflictSource,
      secretAsymmetry: row.secretAsymmetry,
      dynamicLabel: row.dynamicLabel,
      nextTurnPoint: row.nextTurnPoint,
      trustScore: row.trustScore,
      conflictScore: row.conflictScore,
      intimacyScore: row.intimacyScore,
      dependencyScore: row.dependencyScore,
      evidence: row.evidence,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async listCharacterCastOptions(novelId: string): Promise<CharacterCastOption[]> {
    const rows = await prisma.characterCastOption.findMany({
      where: { novelId },
      include: {
        members: { orderBy: { sortOrder: "asc" } },
        relations: { orderBy: { sortOrder: "asc" } },
      },
      orderBy: [
        { updatedAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    return rows.map((row) => ({
      id: row.id,
      novelId: row.novelId,
      title: row.title,
      summary: row.summary,
      whyItWorks: row.whyItWorks,
      recommendedReason: row.recommendedReason,
      status: row.status,
      sourceStoryInput: row.sourceStoryInput,
      members: row.members.map((member) => ({
        id: member.id,
        optionId: member.optionId,
        sortOrder: member.sortOrder,
        name: member.name,
        role: member.role,
        castRole: member.castRole as CharacterCastRole,
        relationToProtagonist: member.relationToProtagonist,
        storyFunction: member.storyFunction,
        shortDescription: member.shortDescription,
        outerGoal: member.outerGoal,
        innerNeed: member.innerNeed,
        fear: member.fear,
        wound: member.wound,
        misbelief: member.misbelief,
        secret: member.secret,
        moralLine: member.moralLine,
        firstImpression: member.firstImpression,
        createdAt: member.createdAt.toISOString(),
        updatedAt: member.updatedAt.toISOString(),
      })),
      relations: row.relations.map((relation) => ({
        id: relation.id,
        optionId: relation.optionId,
        sortOrder: relation.sortOrder,
        sourceName: relation.sourceName,
        targetName: relation.targetName,
        surfaceRelation: relation.surfaceRelation,
        hiddenTension: relation.hiddenTension,
        conflictSource: relation.conflictSource,
        secretAsymmetry: relation.secretAsymmetry,
        dynamicLabel: relation.dynamicLabel,
        nextTurnPoint: relation.nextTurnPoint,
        createdAt: relation.createdAt.toISOString(),
        updatedAt: relation.updatedAt.toISOString(),
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async generateCharacterCastOptions(
    novelId: string,
    options: CharacterPrepOptions = {},
  ): Promise<CharacterCastOption[]> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: {
        genre: { select: { name: true } },
        world: {
          select: {
            name: true,
            description: true,
            overviewSummary: true,
            conflicts: true,
            magicSystem: true,
          },
        },
        bible: {
          select: {
            coreSetting: true,
            mainPromise: true,
            characterArcs: true,
            worldRules: true,
          },
        },
        storyMacroPlan: {
          select: {
            storyInput: true,
            decompositionJson: true,
            constraintEngineJson: true,
          },
        },
      },
    });

    if (!novel) {
      throw new Error("Novel not found.");
    }

    const storyInput = options.storyInput?.trim()
      || novel.storyMacroPlan?.storyInput?.trim()
      || novel.description?.trim()
      || "";

    const promptSections = [
      `Project title: ${novel.title}`,
      `Story input: ${storyInput || "No direct story input is available yet. Build from the genre, world, and current setup."}`,
      `Genre: ${novel.genre?.name ?? "Unspecified"}`,
      `Style tone: ${novel.styleTone ?? "Unspecified"}`,
      `Narrative POV: ${novel.narrativePov ?? "Unspecified"}`,
      `Pacing preference: ${novel.pacePreference ?? "Unspecified"}`,
      `Emotion intensity: ${novel.emotionIntensity ?? "Unspecified"}`,
      `Core promise: ${novel.bible?.mainPromise ?? "None"}`,
      `Core setting: ${novel.bible?.coreSetting ?? "None"}`,
      `Character arc hints: ${novel.bible?.characterArcs ?? "None"}`,
      `World rules: ${novel.bible?.worldRules ?? "None"}`,
      `World stage: ${novel.world
        ? [novel.world.name, novel.world.description, novel.world.overviewSummary, novel.world.conflicts, novel.world.magicSystem]
          .filter((item) => typeof item === "string" && item.trim().length > 0)
          .join("\n")
        : "No world is bound yet."}`,
      `Macro decomposition: ${novel.storyMacroPlan?.decompositionJson ?? "None"}`,
      `Constraint engine: ${novel.storyMacroPlan?.constraintEngineJson ?? "None"}`,
    ];

    const parsed = await invokeStructuredLlm({
      label: `character-cast-options:${novelId}`,
      provider: options.provider,
      model: options.model,
      temperature: options.temperature ?? 0.5,
      taskType: "planner",
      systemPrompt: [
        "You are designing the long-form character system for a novel project.",
        "Return strict JSON only.",
        "Produce exactly 3 distinct cast options.",
        "Each option must focus on protagonist desire, antagonist pressure, relationship tension, growth cost, and sustainable long-arc conflict.",
        "Each option must contain 3-6 core characters and 2-12 high-value relationships.",
        "Do not output shallow bio cards only. Include story function, relationship dynamics, and conflict pressure.",
        "Allowed castRole values: protagonist, antagonist, ally, foil, mentor, love_interest, pressure_source, catalyst.",
        "Use the exact JSON shape below and keep the exact English field names.",
        CHARACTER_CAST_OPTION_RESPONSE_TEMPLATE,
        "Do not translate field names into Chinese.",
        "Do not rename keys like title, summary, members, relations, sourceName, or targetName.",
        "Do not wrap each option inside another object such as {\"option\": {...}}.",
        "Every option must include title, summary, members, and relations.",
        "Optional text fields may be empty strings, but required fields must never be omitted.",
      ].join("\n"),
      userPrompt: promptSections.join("\n\n"),
      schema: characterCastOptionResponseSchema,
      maxRepairAttempts: 1,
    });

    await prisma.$transaction(async (tx) => {
      await tx.characterCastOption.deleteMany({ where: { novelId } });
      for (const option of parsed.options) {
        await tx.characterCastOption.create({
          data: {
            novelId,
            title: option.title,
            summary: option.summary,
            whyItWorks: option.whyItWorks || null,
            recommendedReason: option.recommendedReason || null,
            sourceStoryInput: storyInput || null,
            members: {
              create: option.members.map((member, index) => ({
                sortOrder: index,
                name: member.name,
                role: member.role,
                castRole: member.castRole,
                relationToProtagonist: member.relationToProtagonist || null,
                storyFunction: member.storyFunction,
                shortDescription: member.shortDescription || null,
                outerGoal: member.outerGoal || null,
                innerNeed: member.innerNeed || null,
                fear: member.fear || null,
                wound: member.wound || null,
                misbelief: member.misbelief || null,
                secret: member.secret || null,
                moralLine: member.moralLine || null,
                firstImpression: member.firstImpression || null,
              })),
            },
            relations: {
              create: option.relations.map((relation, index) => ({
                sortOrder: index,
                sourceName: relation.sourceName,
                targetName: relation.targetName,
                surfaceRelation: relation.surfaceRelation,
                hiddenTension: relation.hiddenTension || null,
                conflictSource: relation.conflictSource || null,
                secretAsymmetry: relation.secretAsymmetry || null,
                dynamicLabel: relation.dynamicLabel || null,
                nextTurnPoint: relation.nextTurnPoint || null,
              })),
            },
          },
        });
      }
    });

    return this.listCharacterCastOptions(novelId);
  }

  async applyCharacterCastOption(
    novelId: string,
    optionId: string,
  ): Promise<CharacterCastApplyResult> {
    const option = await prisma.characterCastOption.findFirst({
      where: { id: optionId, novelId },
      include: {
        members: { orderBy: { sortOrder: "asc" } },
        relations: { orderBy: { sortOrder: "asc" } },
      },
    });

    if (!option) {
      throw new Error("Character cast option not found.");
    }

    const existingCharacters = await prisma.character.findMany({
      where: { novelId },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });

    const characterIdByName = new Map<string, string>();
    const involvedCharacterIds: string[] = [];
    let createdCount = 0;
    let updatedCount = 0;

    for (const member of option.members) {
      const matched = existingCharacters.find((item) => item.name === member.name);
      if (matched) {
        updatedCount += 1;
        const updated = await this.novelContextService.updateCharacter(novelId, matched.id, {
          name: member.name,
          role: member.role,
          castRole: member.castRole,
          storyFunction: member.storyFunction,
          relationToProtagonist: member.relationToProtagonist ?? undefined,
          outerGoal: member.outerGoal ?? undefined,
          innerNeed: member.innerNeed ?? undefined,
          fear: member.fear ?? undefined,
          wound: member.wound ?? undefined,
          misbelief: member.misbelief ?? undefined,
          secret: member.secret ?? undefined,
          moralLine: member.moralLine ?? undefined,
          firstImpression: member.firstImpression ?? undefined,
        });
        involvedCharacterIds.push(updated.id);
        characterIdByName.set(updated.name, updated.id);
        continue;
      }

      createdCount += 1;
      const created = await this.novelContextService.createCharacter(novelId, {
        name: member.name,
        role: member.role,
        castRole: member.castRole,
        storyFunction: member.storyFunction,
        relationToProtagonist: member.relationToProtagonist ?? undefined,
        outerGoal: member.outerGoal ?? undefined,
        innerNeed: member.innerNeed ?? undefined,
        fear: member.fear ?? undefined,
        wound: member.wound ?? undefined,
        misbelief: member.misbelief ?? undefined,
        secret: member.secret ?? undefined,
        moralLine: member.moralLine ?? undefined,
        firstImpression: member.firstImpression ?? undefined,
        currentGoal: member.outerGoal ?? undefined,
        currentState: "Awaiting story entry",
      });
      involvedCharacterIds.push(created.id);
      characterIdByName.set(created.name, created.id);
    }

    const uniqueCharacterIds = Array.from(new Set(involvedCharacterIds));
    await prisma.characterRelation.deleteMany({
      where: {
        novelId,
        OR: [
          { sourceCharacterId: { in: uniqueCharacterIds } },
          { targetCharacterId: { in: uniqueCharacterIds } },
        ],
      },
    });

    const seenRelationKeys = new Set<string>();
    const relationRows = option.relations
      .map((relation) => {
        const sourceCharacterId = characterIdByName.get(relation.sourceName);
        const targetCharacterId = characterIdByName.get(relation.targetName);
        if (!sourceCharacterId || !targetCharacterId || sourceCharacterId === targetCharacterId) {
          return null;
        }
        const relationKey = `${sourceCharacterId}:${targetCharacterId}`;
        if (seenRelationKeys.has(relationKey)) {
          return null;
        }
        seenRelationKeys.add(relationKey);
        return {
          novelId,
          sourceCharacterId,
          targetCharacterId,
          surfaceRelation: relation.surfaceRelation,
          hiddenTension: relation.hiddenTension || null,
          conflictSource: relation.conflictSource || null,
          secretAsymmetry: relation.secretAsymmetry || null,
          dynamicLabel: relation.dynamicLabel || null,
          nextTurnPoint: relation.nextTurnPoint || null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    if (relationRows.length > 0) {
      await prisma.characterRelation.createMany({ data: relationRows });
    }

    await prisma.characterCastOption.updateMany({
      where: { novelId },
      data: { status: "draft" },
    });
    await prisma.characterCastOption.update({
      where: { id: option.id },
      data: { status: "applied" },
    });

    await this.characterDynamicsService.rebuildDynamics(novelId, {
      sourceType: "cast_option_projection",
    }).catch(() => null);

    return {
      optionId: option.id,
      createdCount,
      updatedCount,
      relationCount: relationRows.length,
      characterIds: uniqueCharacterIds,
      primaryCharacterId: characterIdByName.get(option.members[0]?.name ?? "") ?? null,
    };
  }
}
