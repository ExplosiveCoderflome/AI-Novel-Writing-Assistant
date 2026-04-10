import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../../db/prisma";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { buildCharacterCastContextBlocks } from "../../../prompting/prompts/novel/characterPreparation.contextBlocks";
import {
  characterCastAutoNormalizePrompt,
  characterCastAutoPrompt,
  characterCastAutoRepairPrompt,
  characterCastOptionNormalizePrompt,
  characterCastOptionPrompt,
  characterCastOptionRepairPrompt,
} from "../../../prompting/prompts/novel/characterPreparation.prompts";
import type {
  CharacterCastAutoResponseParsed,
  CharacterCastOptionResponseParsed,
} from "../../../prompting/prompts/novel/characterPreparation.promptSchemas";
import { buildStoryModePromptBlock, normalizeStoryModeOutput } from "../../storyMode/storyModeProfile";
import {
  assessCharacterCastBatch,
  buildCharacterCastRepairReasons,
  shouldNormalizeCharacterCastLanguage,
  type CharacterCastBatchAssessment,
} from "./characterCastQuality";

export interface CharacterPrepOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  storyInput?: string;
}

type CharacterCastGenerationContextBlocks = ReturnType<typeof buildCharacterCastContextBlocks>;

interface CharacterCastGenerationContext {
  storyInput: string;
  contextBlocks: CharacterCastGenerationContextBlocks;
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

async function loadCastGenerationContext(
  novelId: string,
  options: CharacterPrepOptions,
): Promise<CharacterCastGenerationContext> {
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
    storyInput,
    contextBlocks,
  };
}

async function normalizeCharacterCastOptions(
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

async function repairCharacterCastOptions(input: {
  parsed: CharacterCastOptionResponseParsed;
  assessment: CharacterCastBatchAssessment;
  contextBlocks: CharacterCastGenerationContextBlocks;
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

async function normalizeAutoCharacterCastOption(
  parsed: CharacterCastAutoResponseParsed,
  options: CharacterPrepOptions,
): Promise<CharacterCastAutoResponseParsed> {
  const result = await runStructuredPrompt({
    asset: characterCastAutoNormalizePrompt,
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

async function repairAutoCharacterCastOption(input: {
  parsed: CharacterCastAutoResponseParsed;
  assessment: CharacterCastBatchAssessment;
  contextBlocks: CharacterCastGenerationContextBlocks;
  options: CharacterPrepOptions;
}): Promise<CharacterCastAutoResponseParsed> {
  const result = await runStructuredPrompt({
    asset: characterCastAutoRepairPrompt,
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

export async function generateCharacterCastOptionsDraft(
  novelId: string,
  options: CharacterPrepOptions = {},
): Promise<{ storyInput: string; parsed: CharacterCastOptionResponseParsed }> {
  const context = await loadCastGenerationContext(novelId, options);
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
    parsed = await normalizeCharacterCastOptions(parsed, options).catch(() => parsed);
  }

  let assessment = assessCharacterCastBatch(parsed.options, context.storyInput);
  if (assessment.autoApplicableOptionIndex === null) {
    parsed = await repairCharacterCastOptions({
      parsed,
      assessment,
      contextBlocks: context.contextBlocks,
      options,
    }).catch(() => parsed);
    if (shouldNormalizeCharacterCastLanguage(parsed.options)) {
      parsed = await normalizeCharacterCastOptions(parsed, options).catch(() => parsed);
    }
    assessment = assessCharacterCastBatch(parsed.options, context.storyInput);
  }

  return {
    storyInput: context.storyInput,
    parsed,
  };
}

export async function generateAutoCharacterCastDraft(
  novelId: string,
  options: CharacterPrepOptions = {},
): Promise<{ storyInput: string; parsed: CharacterCastAutoResponseParsed }> {
  const context = await loadCastGenerationContext(novelId, options);
  const generation = await runStructuredPrompt({
    asset: characterCastAutoPrompt,
    promptInput: {},
    contextBlocks: context.contextBlocks,
    options: {
      provider: options.provider,
      model: options.model,
      temperature: options.temperature ?? 0.5,
    },
  });

  let parsed = generation.output;
  if (shouldNormalizeCharacterCastLanguage([parsed.option])) {
    parsed = await normalizeAutoCharacterCastOption(parsed, options).catch(() => parsed);
  }

  let assessment = assessCharacterCastBatch([parsed.option], context.storyInput);
  if (assessment.autoApplicableOptionIndex === null) {
    parsed = await repairAutoCharacterCastOption({
      parsed,
      assessment,
      contextBlocks: context.contextBlocks,
      options,
    }).catch(() => parsed);
    if (shouldNormalizeCharacterCastLanguage([parsed.option])) {
      parsed = await normalizeAutoCharacterCastOption(parsed, options).catch(() => parsed);
    }
    assessment = assessCharacterCastBatch([parsed.option], context.storyInput);
  }

  return {
    storyInput: context.storyInput,
    parsed,
  };
}

export async function persistCharacterCastOptionsDraft(
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
