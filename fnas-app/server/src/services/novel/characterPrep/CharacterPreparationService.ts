import type {
  CharacterCastApplyResult,
  CharacterCastOption,
  CharacterCastOptionClearResult,
  CharacterCastOptionDeleteResult,
  CharacterCastRole,
  CharacterRelation,
  SupplementalCharacterApplyResult,
  SupplementalCharacterCandidate,
  SupplementalCharacterGenerateInput,
  SupplementalCharacterGenerationResult,
} from "@ai-novel/shared/types/novel";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../../db/prisma";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  buildCharacterCastContextBlocks,
} from "../../../prompting/prompts/novel/characterPreparation.contextBlocks";
import {
  characterCastOptionNormalizePrompt,
  characterCastOptionPrompt,
  characterCastOptionRepairPrompt,
} from "../../../prompting/prompts/novel/characterPreparation.prompts";
import type { CharacterCastOptionResponseParsed } from "../../../prompting/prompts/novel/characterPreparation.promptSchemas";
import { buildStoryModePromptBlock, normalizeStoryModeOutput } from "../../storyMode/storyModeProfile";
import { NovelContextService } from "../NovelContextService";
import { CharacterDynamicsService } from "../dynamics/CharacterDynamicsService";
import { CharacterPreparationSupplementalService } from "./characterPreparationSupplemental";
import {
  assessCharacterCastBatch,
  buildCharacterCastBlockedMessage,
  buildCharacterCastRepairReasons,
  shouldNormalizeCharacterCastLanguage,
  type CharacterCastBatchAssessment,
} from "./characterCastQuality";

interface CharacterPrepOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  storyInput?: string;
}

function toOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function buildWorldStage(novel: {
  world: {
    name: string;
    description: string | null;
    overviewSummary: string | null;
    conflicts: string | null;
    magicSystem: string | null;
  } | null;
}) {
  return novel.world
    ? [
      novel.world.name,
      novel.world.description,
      novel.world.overviewSummary,
      novel.world.conflicts,
      novel.world.magicSystem,
    ]
      .filter((item) => typeof item === "string" && item.trim().length > 0)
      .join("\n")
    : "当前还没有绑定世界观。";
}

function serializeCharacterCastOption(row: {
  id: string;
  novelId: string;
  title: string;
  summary: string;
  whyItWorks: string | null;
  recommendedReason: string | null;
  status: string;
  sourceStoryInput: string | null;
  createdAt: Date;
  updatedAt: Date;
  members: Array<{
    id: string;
    optionId: string;
    sortOrder: number;
    name: string;
    role: string;
    gender: string;
    castRole: string;
    relationToProtagonist: string | null;
    storyFunction: string;
    shortDescription: string | null;
    outerGoal: string | null;
    innerNeed: string | null;
    fear: string | null;
    wound: string | null;
    misbelief: string | null;
    secret: string | null;
    moralLine: string | null;
    firstImpression: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  relations: Array<{
    id: string;
    optionId: string;
    sortOrder: number;
    sourceName: string;
    targetName: string;
    surfaceRelation: string;
    hiddenTension: string | null;
    conflictSource: string | null;
    secretAsymmetry: string | null;
    dynamicLabel: string | null;
    nextTurnPoint: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
}): CharacterCastOption {
  return {
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
      gender: member.gender as CharacterCastOption["members"][number]["gender"],
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
  };
}

export class CharacterPreparationService {
  private readonly novelContextService = new NovelContextService();
  private readonly characterDynamicsService = new CharacterDynamicsService();
  private readonly supplementalService = new CharacterPreparationSupplementalService(
    this.novelContextService,
    this.characterDynamicsService,
  );

  private async loadCastGenerationContext(novelId: string, options: CharacterPrepOptions) {
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
        bookContract: {
          select: {
            readingPromise: true,
            protagonistFantasy: true,
            coreSellingPoint: true,
            chapter3Payoff: true,
            chapter10Payoff: true,
            chapter30Payoff: true,
            escalationLadder: true,
            relationshipMainline: true,
          },
        },
        primaryStoryMode: {
          select: {
            id: true,
            name: true,
            description: true,
            template: true,
            parentId: true,
            profileJson: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        secondaryStoryMode: {
          select: {
            id: true,
            name: true,
            description: true,
            template: true,
            parentId: true,
            profileJson: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        characters: {
          select: {
            name: true,
          },
          orderBy: { createdAt: "asc" },
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
    const storyModeBlock = buildStoryModePromptBlock({
      primary: novel.primaryStoryMode ? normalizeStoryModeOutput(novel.primaryStoryMode) : null,
      secondary: novel.secondaryStoryMode ? normalizeStoryModeOutput(novel.secondaryStoryMode) : null,
    });
    const contextBlocks = buildCharacterCastContextBlocks({
      projectTitle: novel.title,
      storyInput: storyInput || "暂无直接故事输入，请结合书级约束补齐真实可入戏角色。",
      genreName: novel.genre?.name ?? null,
      storyModeBlock,
      styleTone: novel.styleTone ?? null,
      narrativePov: novel.narrativePov ?? null,
      pacePreference: novel.pacePreference ?? null,
      emotionIntensity: novel.emotionIntensity ?? null,
      corePromise: novel.bible?.mainPromise ?? null,
      coreSetting: novel.bible?.coreSetting ?? null,
      characterArcs: novel.bible?.characterArcs ?? null,
      worldRules: novel.bible?.worldRules ?? null,
      worldStage: buildWorldStage(novel),
      storyDecomposition: novel.storyMacroPlan?.decompositionJson ?? null,
      constraintEngine: novel.storyMacroPlan?.constraintEngineJson ?? null,
      bookContract: novel.bookContract,
      existingCharacterNames: novel.characters.map((character) => character.name),
    });

    return {
      novel,
      storyInput,
      contextBlocks,
    };
  }

  private async normalizeCharacterCastOptions(
    parsed: CharacterCastOptionResponseParsed,
    options: CharacterPrepOptions,
  ): Promise<CharacterCastOptionResponseParsed> {
    const result = await runStructuredPrompt({
      asset: characterCastOptionNormalizePrompt,
      promptInput: {
        payloadJson: JSON.stringify(parsed, null, 2),
      },
      options: {
        provider: options.provider,
        model: options.model,
        temperature: 0.2,
      },
    });
    return result.output;
  }

  private async repairCharacterCastOptions(input: {
    parsed: CharacterCastOptionResponseParsed;
    assessment: CharacterCastBatchAssessment;
    contextBlocks: ReturnType<typeof buildCharacterCastContextBlocks>;
    options: CharacterPrepOptions;
  }): Promise<CharacterCastOptionResponseParsed> {
    const result = await runStructuredPrompt({
      asset: characterCastOptionRepairPrompt,
      promptInput: {
        payloadJson: JSON.stringify(input.parsed, null, 2),
        failureReasons: buildCharacterCastRepairReasons(input.assessment),
      },
      contextBlocks: input.contextBlocks,
      options: {
        provider: input.options.provider,
        model: input.options.model,
        temperature: Math.max(0.2, Math.min(input.options.temperature ?? 0.55, 0.6)),
      },
    });
    return result.output;
  }

  private async persistCharacterCastOptions(
    novelId: string,
    storyInput: string,
    parsed: CharacterCastOptionResponseParsed,
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.characterCastOption.deleteMany({ where: { novelId } });
      for (const option of parsed.options) {
        await tx.characterCastOption.create({
          data: {
            novelId,
            title: option.title,
            summary: option.summary,
            whyItWorks: toOptionalText(option.whyItWorks),
            recommendedReason: toOptionalText(option.recommendedReason),
            sourceStoryInput: toOptionalText(storyInput),
            members: {
              create: option.members.map((member, index) => ({
                sortOrder: index,
                name: member.name,
                role: member.role,
                gender: member.gender,
                castRole: member.castRole,
                relationToProtagonist: toOptionalText(member.relationToProtagonist),
                storyFunction: member.storyFunction,
                shortDescription: toOptionalText(member.shortDescription),
                outerGoal: toOptionalText(member.outerGoal),
                innerNeed: toOptionalText(member.innerNeed),
                fear: toOptionalText(member.fear),
                wound: toOptionalText(member.wound),
                misbelief: toOptionalText(member.misbelief),
                secret: toOptionalText(member.secret),
                moralLine: toOptionalText(member.moralLine),
                firstImpression: toOptionalText(member.firstImpression),
              })),
            },
            relations: {
              create: option.relations.map((relation, index) => ({
                sortOrder: index,
                sourceName: relation.sourceName,
                targetName: relation.targetName,
                surfaceRelation: relation.surfaceRelation,
                hiddenTension: toOptionalText(relation.hiddenTension),
                conflictSource: toOptionalText(relation.conflictSource),
                secretAsymmetry: toOptionalText(relation.secretAsymmetry),
                dynamicLabel: toOptionalText(relation.dynamicLabel),
                nextTurnPoint: toOptionalText(relation.nextTurnPoint),
              })),
            },
          },
        });
      }
    });
  }

  assessCharacterCastOptions(
    castOptions: CharacterCastOption[],
    storyInput: string,
  ): CharacterCastBatchAssessment {
    return assessCharacterCastBatch(castOptions, storyInput);
  }

  listCharacterCastOptions(novelId: string): Promise<CharacterCastOption[]> {
    return prisma.characterCastOption.findMany({
      where: { novelId },
      include: {
        members: { orderBy: { sortOrder: "asc" } },
        relations: { orderBy: { sortOrder: "asc" } },
      },
      orderBy: [
        { updatedAt: "desc" },
        { createdAt: "desc" },
      ],
    }).then((rows) => rows.map((row) => serializeCharacterCastOption(row)));
  }

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

  async generateSupplementalCharacters(
    novelId: string,
    options: SupplementalCharacterGenerateInput = {},
  ): Promise<SupplementalCharacterGenerationResult> {
    return this.supplementalService.generateSupplementalCharacters(novelId, options);
  }

  async generateCharacterCastOptions(
    novelId: string,
    options: CharacterPrepOptions = {},
  ): Promise<CharacterCastOption[]> {
    const context = await this.loadCastGenerationContext(novelId, options);
    const generation = await runStructuredPrompt({
      asset: characterCastOptionPrompt,
      promptInput: {
        optionCount: 3,
      },
      contextBlocks: context.contextBlocks,
      options: {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.5,
      },
    });

    let parsed = generation.output;
    if (shouldNormalizeCharacterCastLanguage(parsed.options)) {
      parsed = await this.normalizeCharacterCastOptions(parsed, options).catch(() => parsed);
    }

    let assessment = assessCharacterCastBatch(parsed.options, context.storyInput);
    if (assessment.autoApplicableOptionIndex === null) {
      parsed = await this.repairCharacterCastOptions({
        parsed,
        assessment,
        contextBlocks: context.contextBlocks,
        options,
      }).catch(() => parsed);
      if (shouldNormalizeCharacterCastLanguage(parsed.options)) {
        parsed = await this.normalizeCharacterCastOptions(parsed, options).catch(() => parsed);
      }
      assessment = assessCharacterCastBatch(parsed.options, context.storyInput);
    }

    await this.persistCharacterCastOptions(novelId, context.storyInput, parsed);
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

    const assessment = assessCharacterCastBatch([
      {
        ...serializeCharacterCastOption(option),
        id: option.id,
      },
    ], option.sourceStoryInput ?? "");
    if (assessment.autoApplicableOptionIndex === null) {
      throw new Error(buildCharacterCastBlockedMessage(assessment));
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
          gender: member.gender as "male" | "female" | "other" | "unknown",
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
        gender: member.gender as "male" | "female" | "other" | "unknown",
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
        currentState: "等待进入正文",
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

  async deleteCharacterCastOption(
    novelId: string,
    optionId: string,
  ): Promise<CharacterCastOptionDeleteResult> {
    const option = await prisma.characterCastOption.findFirst({
      where: { id: optionId, novelId },
      select: { id: true, status: true },
    });

    if (!option) {
      throw new Error("Character cast option not found.");
    }

    await prisma.characterCastOption.delete({
      where: { id: option.id },
    });

    const remainingOptionCount = await prisma.characterCastOption.count({
      where: { novelId },
    });

    return {
      deletedOptionId: option.id,
      deletedAppliedOption: option.status === "applied",
      remainingOptionCount,
    };
  }

  async clearCharacterCastOptions(novelId: string): Promise<CharacterCastOptionClearResult> {
    const options = await prisma.characterCastOption.findMany({
      where: { novelId },
      select: { status: true },
    });

    if (options.length === 0) {
      return {
        deletedCount: 0,
        deletedAppliedCount: 0,
        remainingOptionCount: 0,
      };
    }

    const deletedAppliedCount = options.filter((option) => option.status === "applied").length;
    await prisma.characterCastOption.deleteMany({ where: { novelId } });

    return {
      deletedCount: options.length,
      deletedAppliedCount,
      remainingOptionCount: 0,
    };
  }

  async applySupplementalCharacter(
    novelId: string,
    candidate: SupplementalCharacterCandidate,
  ): Promise<SupplementalCharacterApplyResult> {
    return this.supplementalService.applySupplementalCharacter(novelId, candidate);
  }
}
