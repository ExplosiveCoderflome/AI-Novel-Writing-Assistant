import type {
  Character,
  CharacterGender,
  CharacterCastRole,
  SupplementalCharacterApplyResult,
  SupplementalCharacterCandidate,
  SupplementalCharacterGenerateInput,
  SupplementalCharacterGenerationResult,
} from "@ai-novel/shared/types/novel";
import { prisma } from "../../../db/prisma";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { buildSupplementalCharacterContextBlocks } from "../../../prompting/prompts/novel/characterPreparation.contextBlocks";
import {
  supplementalCharacterNormalizePrompt,
  supplementalCharacterPrompt,
} from "../../../prompting/prompts/novel/characterPreparation.prompts";
import { NovelContextService } from "../NovelContextService";
import { CharacterDynamicsService } from "../dynamics/CharacterDynamicsService";
import {
  supplementalCharacterCandidateSchema,
  type SupplementalCharacterGenerationResponseParsed,
} from "../../../prompting/prompts/novel/characterPreparation.promptSchemas";
import { buildStoryModePromptBlock, normalizeStoryModeOutput } from "../../storyMode/storyModeProfile";

type CharacterRowForOutput = Awaited<ReturnType<typeof prisma.character.create>>;

const SUPPLEMENTAL_MODE_PROMPT_LABELS: Record<NonNullable<SupplementalCharacterGenerateInput["mode"]>, string> = {
  auto: "由 AI 自行判断最合适的补位方式",
  linked: "围绕现有角色衍生关系角色",
  independent: "生成相对独立但仍有明确故事作用的角色",
};

const CAST_ROLE_PROMPT_LABELS: Record<CharacterCastRole | "auto", string> = {
  auto: "由 AI 自行判断",
  protagonist: "主角",
  antagonist: "主对手",
  ally: "同盟",
  foil: "镜像角色",
  mentor: "导师",
  love_interest: "情感牵引",
  pressure_source: "压力源",
  catalyst: "催化者",
};

function getCastRolePromptLabel(castRole: string | null | undefined): string {
  if (!castRole) {
    return "未指定";
  }
  if (castRole in CAST_ROLE_PROMPT_LABELS) {
    return CAST_ROLE_PROMPT_LABELS[castRole as CharacterCastRole | "auto"];
  }
  return castRole;
}

function toOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function serializeCharacter(row: CharacterRowForOutput): Character {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    gender: row.gender as CharacterGender | null,
    castRole: row.castRole as CharacterCastRole | null,
    storyFunction: row.storyFunction,
    relationToProtagonist: row.relationToProtagonist,
    personality: row.personality,
    background: row.background,
    development: row.development,
    outerGoal: row.outerGoal,
    innerNeed: row.innerNeed,
    fear: row.fear,
    wound: row.wound,
    misbelief: row.misbelief,
    secret: row.secret,
    moralLine: row.moralLine,
    firstImpression: row.firstImpression,
    arcStart: row.arcStart,
    arcMidpoint: row.arcMidpoint,
    arcClimax: row.arcClimax,
    arcEnd: row.arcEnd,
    currentState: row.currentState,
    currentGoal: row.currentGoal,
    lastEvolvedAt: row.lastEvolvedAt?.toISOString() ?? null,
    novelId: row.novelId,
    baseCharacterId: row.baseCharacterId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function hasTooMuchLatinText(value: string | null | undefined): boolean {
  const text = value?.trim() ?? "";
  if (!text) {
    return false;
  }
  const latinCount = (text.match(/[A-Za-z]/g) ?? []).length;
  const chineseCount = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  return latinCount >= 8 && latinCount > chineseCount * 2;
}

function toPromptFallback(value: string | null | undefined, fallback: string): string {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

function shouldNormalizeSupplementalLanguage(parsed: SupplementalCharacterGenerationResponseParsed): boolean {
  if (hasTooMuchLatinText(parsed.planningSummary)) {
    return true;
  }

  return parsed.candidates.some((candidate) => {
    const candidateTexts = [
      candidate.role,
      candidate.summary,
      candidate.storyFunction,
      candidate.relationToProtagonist,
      candidate.personality,
      candidate.background,
      candidate.development,
      candidate.outerGoal,
      candidate.innerNeed,
      candidate.fear,
      candidate.wound,
      candidate.misbelief,
      candidate.secret,
      candidate.moralLine,
      candidate.firstImpression,
      candidate.currentState,
      candidate.currentGoal,
      candidate.whyNow,
      ...candidate.relations.flatMap((relation) => [
        relation.surfaceRelation,
        relation.hiddenTension,
        relation.conflictSource,
        relation.dynamicLabel,
        relation.nextTurnPoint,
      ]),
    ];
    return candidateTexts.some((text) => hasTooMuchLatinText(text));
  });
}

async function normalizeSupplementalLanguage(
  novelId: string,
  options: SupplementalCharacterGenerateInput,
  parsed: SupplementalCharacterGenerationResponseParsed,
): Promise<SupplementalCharacterGenerationResponseParsed> {
  const result = await runStructuredPrompt({
    asset: supplementalCharacterNormalizePrompt,
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

export class CharacterPreparationSupplementalService {
  constructor(
    private readonly novelContextService: NovelContextService,
    private readonly characterDynamicsService: CharacterDynamicsService,
  ) {}

  async generateSupplementalCharacters(
    novelId: string,
    options: SupplementalCharacterGenerateInput = {},
  ): Promise<SupplementalCharacterGenerationResult> {
    const mode = options.mode ?? "auto";
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
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            role: true,
            gender: true,
            castRole: true,
            storyFunction: true,
            relationToProtagonist: true,
            personality: true,
            background: true,
            development: true,
            outerGoal: true,
            currentState: true,
            currentGoal: true,
          },
        },
        characterRelations: {
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          include: {
            sourceCharacter: { select: { id: true, name: true } },
            targetCharacter: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!novel) {
      throw new Error("Novel not found.");
    }

    const anchorIds = Array.from(new Set((options.anchorCharacterIds ?? []).filter(Boolean)));
    const storyModeBlock = buildStoryModePromptBlock({
      primary: novel.primaryStoryMode ? normalizeStoryModeOutput(novel.primaryStoryMode) : null,
      secondary: novel.secondaryStoryMode ? normalizeStoryModeOutput(novel.secondaryStoryMode) : null,
    });
    const anchorCharacters = novel.characters.filter((character) => anchorIds.includes(character.id));
    const relevantRelations = anchorCharacters.length > 0
      ? novel.characterRelations.filter(
        (relation) => anchorIds.includes(relation.sourceCharacterId) || anchorIds.includes(relation.targetCharacterId),
      )
      : novel.characterRelations.slice(0, 12);
    const targetCountText = typeof options.count === "number"
      ? `本次必须生成 ${options.count} 个候选角色。`
      : "如果用户没有指定数量，请根据当前角色网络的缺口，自行判断更适合生成 1 个、2 个还是 3 个候选，并把建议数量写入 recommendedCount。";
    const contextBlocks = buildSupplementalCharacterContextBlocks({
      projectTitle: novel.title,
      modeLabel: `${mode}（${SUPPLEMENTAL_MODE_PROMPT_LABELS[mode]}）`,
      targetRoleLabel: `${options.targetCastRole ?? "auto"}（${getCastRolePromptLabel(options.targetCastRole ?? "auto")}）`,
      requestedCountText: targetCountText,
      userPrompt: toPromptFallback(options.userPrompt, "无"),
      storyInput: toPromptFallback(
        novel.storyMacroPlan?.storyInput?.trim() || novel.description?.trim(),
        "暂无明确故事输入，请结合题材、世界观和已有角色自行推断补位方向。",
      ),
      genreName: novel.genre?.name ?? "未指定",
      storyModeBlock,
      styleTone: novel.styleTone ?? "未指定",
      narrativePov: novel.narrativePov ?? "未指定",
      pacePreference: novel.pacePreference ?? "未指定",
      emotionIntensity: novel.emotionIntensity ?? "未指定",
      corePromise: novel.bible?.mainPromise ?? "暂无",
      coreSetting: novel.bible?.coreSetting ?? "暂无",
      characterArcs: novel.bible?.characterArcs ?? "暂无",
      worldRules: novel.bible?.worldRules ?? "暂无",
      worldStage: novel.world
        ? [novel.world.name, novel.world.description, novel.world.overviewSummary, novel.world.conflicts, novel.world.magicSystem]
          .filter((item) => typeof item === "string" && item.trim().length > 0)
          .join("\n")
        : "当前还没有绑定世界观。",
      storyDecomposition: novel.storyMacroPlan?.decompositionJson ?? "暂无",
      constraintEngine: novel.storyMacroPlan?.constraintEngineJson ?? "暂无",
      existingCharactersText: novel.characters.length > 0
        ? novel.characters
          .map((character) => [
            `${character.name} (${character.role})`,
            character.castRole ? `阵容位=${getCastRolePromptLabel(character.castRole)} (${character.castRole})` : "",
            character.storyFunction ? `故事作用=${character.storyFunction}` : "",
            character.relationToProtagonist ? `与主角关系=${character.relationToProtagonist}` : "",
            character.outerGoal ? `外在目标=${character.outerGoal}` : "",
            character.currentState ? `当前状态=${character.currentState}` : "",
            character.currentGoal ? `当前目标=${character.currentGoal}` : "",
          ].filter(Boolean).join(" | "))
          .join("\n")
        : "当前还没有已创建角色。",
      anchorCharactersText: anchorCharacters.length > 0
        ? anchorCharacters
          .map((character) => [
            `${character.name} (${character.role})`,
            character.storyFunction ? `故事作用=${character.storyFunction}` : "",
            character.relationToProtagonist ? `与主角关系=${character.relationToProtagonist}` : "",
            character.currentState ? `当前状态=${character.currentState}` : "",
            character.currentGoal ? `当前目标=${character.currentGoal}` : "",
          ].filter(Boolean).join(" | "))
          .join("\n")
        : "当前没有明确选中的锚点角色。",
      relationsText: relevantRelations.length > 0
        ? relevantRelations
          .map((relation) => [
            `${relation.sourceCharacter.name} -> ${relation.targetCharacter.name}`,
            `表层关系=${relation.surfaceRelation}`,
            relation.hiddenTension ? `隐藏张力=${relation.hiddenTension}` : "",
            relation.conflictSource ? `冲突来源=${relation.conflictSource}` : "",
            relation.dynamicLabel ? `动态标签=${relation.dynamicLabel}` : "",
            relation.nextTurnPoint ? `下一步转折=${relation.nextTurnPoint}` : "",
          ].filter(Boolean).join(" | "))
          .join("\n")
        : "暂无。",
      forbiddenNames: novel.characters.map((character) => character.name),
    });

    const result = await runStructuredPrompt({
      asset: supplementalCharacterPrompt,
      promptInput: {},
      contextBlocks,
      options: {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.55,
      },
    });
    const parsed = result.output;
    const normalizedParsed = shouldNormalizeSupplementalLanguage(parsed)
      ? await normalizeSupplementalLanguage(novelId, options, parsed).catch(() => parsed)
      : parsed;
    if (shouldNormalizeSupplementalLanguage(normalizedParsed)) {
      throw new Error("补充角色生成结果仍含大段英文描述，请重试一次或切换模型后再生成。");
    }

    const requestedCount = typeof options.count === "number" ? options.count : null;
    const normalizedCandidates = (requestedCount ? normalizedParsed.candidates.slice(0, requestedCount) : normalizedParsed.candidates)
      .map((candidate) => supplementalCharacterCandidateSchema.parse(candidate))
      .slice(0, 3);

    return {
      mode: normalizedParsed.mode,
      recommendedCount: requestedCount ?? Math.min(Math.max(normalizedParsed.recommendedCount, 1), normalizedCandidates.length || 1),
      planningSummary: toOptionalText(normalizedParsed.planningSummary),
      candidates: normalizedCandidates.map((candidate) => ({
        name: candidate.name,
        role: candidate.role,
        gender: candidate.gender,
        castRole: candidate.castRole,
        summary: candidate.summary,
        storyFunction: candidate.storyFunction,
        relationToProtagonist: toOptionalText(candidate.relationToProtagonist),
        personality: toOptionalText(candidate.personality),
        background: toOptionalText(candidate.background),
        development: toOptionalText(candidate.development),
        outerGoal: toOptionalText(candidate.outerGoal),
        innerNeed: toOptionalText(candidate.innerNeed),
        fear: toOptionalText(candidate.fear),
        wound: toOptionalText(candidate.wound),
        misbelief: toOptionalText(candidate.misbelief),
        secret: toOptionalText(candidate.secret),
        moralLine: toOptionalText(candidate.moralLine),
        firstImpression: toOptionalText(candidate.firstImpression),
        currentState: toOptionalText(candidate.currentState),
        currentGoal: toOptionalText(candidate.currentGoal),
        whyNow: toOptionalText(candidate.whyNow),
        relations: candidate.relations.map((relation) => ({
          sourceName: relation.sourceName,
          targetName: relation.targetName,
          surfaceRelation: relation.surfaceRelation,
          hiddenTension: toOptionalText(relation.hiddenTension),
          conflictSource: toOptionalText(relation.conflictSource),
          dynamicLabel: toOptionalText(relation.dynamicLabel),
          nextTurnPoint: toOptionalText(relation.nextTurnPoint),
        })),
      })),
    };
  }

  async applySupplementalCharacter(
    novelId: string,
    candidate: SupplementalCharacterCandidate,
  ): Promise<SupplementalCharacterApplyResult> {
    const parsedCandidate = supplementalCharacterCandidateSchema.parse(candidate);
    const existingCharacters = await prisma.character.findMany({
      where: { novelId },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });

    if (existingCharacters.some((character) => character.name === parsedCandidate.name)) {
      throw new Error(`角色「${parsedCandidate.name}」已存在，请重新生成或修改名称后再创建。`);
    }

    const created = await this.novelContextService.createCharacter(novelId, {
      name: parsedCandidate.name,
      role: parsedCandidate.role,
      gender: parsedCandidate.gender,
      castRole: parsedCandidate.castRole,
      storyFunction: parsedCandidate.storyFunction,
      relationToProtagonist: toOptionalText(parsedCandidate.relationToProtagonist) ?? undefined,
      personality: toOptionalText(parsedCandidate.personality) ?? undefined,
      background: toOptionalText(parsedCandidate.background) ?? undefined,
      development: toOptionalText(parsedCandidate.development) ?? undefined,
      outerGoal: toOptionalText(parsedCandidate.outerGoal) ?? undefined,
      innerNeed: toOptionalText(parsedCandidate.innerNeed) ?? undefined,
      fear: toOptionalText(parsedCandidate.fear) ?? undefined,
      wound: toOptionalText(parsedCandidate.wound) ?? undefined,
      misbelief: toOptionalText(parsedCandidate.misbelief) ?? undefined,
      secret: toOptionalText(parsedCandidate.secret) ?? undefined,
      moralLine: toOptionalText(parsedCandidate.moralLine) ?? undefined,
      firstImpression: toOptionalText(parsedCandidate.firstImpression) ?? undefined,
      currentState: toOptionalText(parsedCandidate.currentState) ?? undefined,
      currentGoal: toOptionalText(parsedCandidate.currentGoal) ?? undefined,
    });

    const characterIdByName = new Map(existingCharacters.map((character) => [character.name, character.id]));
    characterIdByName.set(created.name, created.id);

    const seenRelationKeys = new Set<string>();
    let relationCount = 0;
    for (const relation of parsedCandidate.relations) {
      const sourceCharacterId = characterIdByName.get(relation.sourceName);
      const targetCharacterId = characterIdByName.get(relation.targetName);
      if (!sourceCharacterId || !targetCharacterId || sourceCharacterId === targetCharacterId) {
        continue;
      }
      const relationKey = `${sourceCharacterId}:${targetCharacterId}`;
      if (seenRelationKeys.has(relationKey)) {
        continue;
      }
      seenRelationKeys.add(relationKey);
      await prisma.characterRelation.upsert({
        where: {
          novelId_sourceCharacterId_targetCharacterId: {
            novelId,
            sourceCharacterId,
            targetCharacterId,
          },
        },
        create: {
          novelId,
          sourceCharacterId,
          targetCharacterId,
          surfaceRelation: relation.surfaceRelation,
          hiddenTension: toOptionalText(relation.hiddenTension),
          conflictSource: toOptionalText(relation.conflictSource),
          dynamicLabel: toOptionalText(relation.dynamicLabel),
          nextTurnPoint: toOptionalText(relation.nextTurnPoint),
        },
        update: {
          surfaceRelation: relation.surfaceRelation,
          hiddenTension: toOptionalText(relation.hiddenTension),
          conflictSource: toOptionalText(relation.conflictSource),
          dynamicLabel: toOptionalText(relation.dynamicLabel),
          nextTurnPoint: toOptionalText(relation.nextTurnPoint),
        },
      });
      relationCount += 1;
    }

    await this.characterDynamicsService.rebuildDynamics(novelId, {
      sourceType: "supplemental_character_projection",
    }).catch(() => null);

    return {
      character: serializeCharacter(created),
      relationCount,
    };
  }
}
