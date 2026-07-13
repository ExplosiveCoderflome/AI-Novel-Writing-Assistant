import type {
  ChapterWriteContext,
  GenerationContextPackage,
} from "@ai-novel/shared/types/chapterRuntime";
import {
  buildBookContractContext,
  buildChapterWriteContext,
} from "../prompts/novel/chapterLayeredContext";
import {
  compactPreviewText,
  parseSceneCards,
  PREVIEW_TIMESTAMP,
  readJsonStringList,
  readString,
  readStringList,
  type PreviewChapterRow,
  type PreviewNovelRow,
} from "./previewContextSupport";

function buildPreviewStyleSection(
  key: NonNullable<ChapterWriteContext["styleContract"]>["narrative"]["key"],
  title: string,
  lines: string[],
): NonNullable<ChapterWriteContext["styleContract"]>["narrative"] {
  const normalizedLines = lines.map((line) => compactPreviewText(line)).filter(Boolean);
  return {
    key,
    title,
    summary: normalizedLines[0] ?? null,
    lines: normalizedLines,
    text: [`${title}:`, ...normalizedLines.map((line) => `- ${line}`)].join("\n"),
    hasContent: normalizedLines.length > 0,
  };
}

function buildPreviewStyleContract(input: {
  novel: PreviewNovelRow;
  chapter: PreviewChapterRow;
}): NonNullable<ChapterWriteContext["styleContract"]> {
  const { chapter, novel } = input;
  const narrative = buildPreviewStyleSection("narrative", "叙事约束", [
    novel.narrativePov ? `叙事视角：${novel.narrativePov}` : "使用清晰稳定的叙事视角，不随意跳出本章场景。",
    novel.description ? `故事底盘：${novel.description}` : "",
  ]);
  const character = buildPreviewStyleSection("character", "角色表达", [
    "角色行动服务本章目标，避免只用解释性总结替代行动和选择。",
    chapter.expectation ? `人物行为围绕章节任务展开：${chapter.expectation}` : "",
  ]);
  const language = buildPreviewStyleSection("language", "语言", [
    "使用简体中文，语言自然流畅，适合网文阅读节奏。",
    novel.styleTone ? `书级语气：${novel.styleTone}` : "",
  ]);
  const rhythm = buildPreviewStyleSection("rhythm", "节奏", [
    novel.pacePreference ? `节奏偏好：${novel.pacePreference}` : "保持推进感，避免长段空泛铺陈。",
    chapter.targetWordCount ? `围绕 ${chapter.targetWordCount} 字目标组织场景密度。` : "",
  ]);
  const antiAi = buildPreviewStyleSection("antiAi", "反 AI 味", [
    "控制无效修饰，避免总结腔、模板化转折和重复回顾。",
  ]);
  const selfCheck = buildPreviewStyleSection("selfCheck", "自检", [
    "输出前检查本章任务、角色硬事实、边界和章末钩子是否被落实。",
  ]);

  return {
    narrative,
    character,
    language,
    rhythm,
    antiAi,
    selfCheck,
    meta: {
      effectiveStyleProfileId: null,
      taskStyleProfileId: null,
      activeSourceTargets: ["novel", "chapter"],
      activeSourceLabels: ["Prompt Workbench 预览"],
      writerIncludedSections: ["narrative", "character", "language", "rhythm", "antiAi", "selfCheck"],
      plannerIncludedSections: ["narrative", "character", "language", "antiAi"],
      droppedSections: [],
      maturity: "summary_only",
      usesGlobalAntiAiBaseline: false,
      globalAntiAiRuleIds: [],
      styleAntiAiRuleIds: [],
    },
  };
}

function buildRuntimeCharacters(characters: NonNullable<PreviewNovelRow["characters"]>): GenerationContextPackage["characterRoster"] {
  return characters.map((character) => ({
    id: character.id,
    name: compactPreviewText(character.name, "未命名角色"),
    role: compactPreviewText(character.role, "supporting"),
    personality: character.personality ?? null,
    background: character.background ?? null,
    development: character.development ?? null,
    identityLabel: character.identityLabel ?? null,
    factionLabel: character.factionLabel ?? null,
    stanceLabel: character.stanceLabel ?? null,
    powerLevel: character.powerLevel ?? null,
    realm: character.realm ?? null,
    currentLocation: character.currentLocation ?? null,
    availability: character.availability ?? null,
    prohibitions: readJsonStringList(character.prohibitionsJson),
    currentState: character.currentState ?? null,
    currentGoal: character.currentGoal ?? null,
    appearance: character.appearance ?? null,
    physique: character.physique ?? null,
    attireStyle: character.attireStyle ?? null,
    signatureDetail: character.signatureDetail ?? null,
    voiceTexture: character.voiceTexture ?? null,
    presenceImpression: character.presenceImpression ?? null,
  }));
}

function buildCharacterHardFacts(
  characters: GenerationContextPackage["characterRoster"],
): GenerationContextPackage["characterHardFacts"] {
  return characters.map((character) => ({
    characterId: character.id,
    name: character.name,
    role: character.role,
    identityLabel: character.identityLabel ?? null,
    factionLabel: character.factionLabel ?? null,
    stanceLabel: character.stanceLabel ?? null,
    powerLevel: character.powerLevel ?? null,
    realm: character.realm ?? null,
    currentLocation: character.currentLocation ?? null,
    availability: character.availability ?? null,
    currentState: character.currentState ?? null,
    currentGoal: character.currentGoal ?? null,
    prohibitions: character.prohibitions ?? [],
    pendingReviewFields: [],
  }));
}

function buildPreviewPlan(input: {
  chapter: PreviewChapterRow;
  characters: GenerationContextPackage["characterRoster"];
}): NonNullable<GenerationContextPackage["plan"]> {
  const { chapter, characters } = input;
  const scenes = parseSceneCards(chapter.sceneCards);
  const mustAdvance = [
    ...scenes.flatMap((scene) => readStringList(scene.mustAdvance)),
    chapter.expectation,
    chapter.taskSheet,
  ].map((item) => compactPreviewText(item)).filter(Boolean).slice(0, 8);
  const mustPreserve = [
    ...scenes.flatMap((scene) => readStringList(scene.mustPreserve)),
    chapter.mustAvoid ? `不得越界：${chapter.mustAvoid}` : "",
  ].map((item) => compactPreviewText(item)).filter(Boolean).slice(0, 8);
  const objective = compactPreviewText(
    chapter.expectation || chapter.taskSheet,
    `推进第 ${chapter.order} 章《${chapter.title || "未命名章节"}》的章节任务。`,
  );

  return {
    id: `workbench-preview-plan:${chapter.id}`,
    chapterId: chapter.id,
    planRole: "progress",
    phaseLabel: null,
    title: compactPreviewText(chapter.title, `第 ${chapter.order} 章`),
    objective,
    participants: characters.slice(0, 6).map((character) => character.name),
    reveals: [],
    riskNotes: [chapter.mustAvoid].map((item) => compactPreviewText(item)).filter(Boolean),
    mustAdvance: mustAdvance.length > 0 ? mustAdvance : [objective],
    mustPreserve,
    sourceIssueIds: [],
    replannedFromPlanId: null,
    hookTarget: compactPreviewText(chapter.hook, "保留新的章末压力或悬念。"),
    rawPlanJson: null,
    scenes: scenes.map((scene, index) => ({
      id: `workbench-preview-scene:${chapter.id}:${index + 1}`,
      sortOrder: index + 1,
      title: readString(scene.title) || `场景 ${index + 1}`,
      objective: readString(scene.purpose) || readStringList(scene.mustAdvance)[0] || null,
      conflict: readString(scene.conflict) || null,
      reveal: readString(scene.reveal) || null,
      emotionBeat: readString(scene.emotionBeat) || null,
    })),
    createdAt: PREVIEW_TIMESTAMP,
    updatedAt: PREVIEW_TIMESTAMP,
  };
}

function buildPreviewStateSnapshot(input: {
  novel: PreviewNovelRow;
  chapter: PreviewChapterRow;
  characters: GenerationContextPackage["characterRoster"];
}): GenerationContextPackage["stateSnapshot"] {
  const { chapter, characters, novel } = input;
  return {
    id: `workbench-preview-state:${chapter.id}`,
    novelId: novel.id,
    sourceChapterId: chapter.id,
    summary: [
      `小说：${novel.title}`,
      `章节：第 ${chapter.order} 章《${chapter.title || "未命名章节"}》`,
      chapter.expectation ? `章节目标：${chapter.expectation}` : "",
      chapter.hook ? `章末钩子：${chapter.hook}` : "",
    ].filter(Boolean).join("\n"),
    rawStateJson: null,
    characterStates: characters.slice(0, 6).map((character) => ({
      characterId: character.id,
      currentGoal: character.currentGoal ?? null,
      emotion: null,
      summary: character.currentState ?? null,
    })),
    relationStates: [],
    informationStates: [],
    foreshadowStates: [],
    createdAt: PREVIEW_TIMESTAMP,
    updatedAt: PREVIEW_TIMESTAMP,
  };
}

function buildPreviewGenerationContextPackage(input: {
  novel: PreviewNovelRow;
  chapter: PreviewChapterRow;
}): GenerationContextPackage {
  const { chapter, novel } = input;
  const characters = buildRuntimeCharacters(Array.isArray(novel.characters) ? novel.characters : []);
  const characterHardFacts = buildCharacterHardFacts(characters);
  const styleContract = buildPreviewStyleContract({ novel, chapter });
  const plan = buildPreviewPlan({ chapter, characters });

  return {
    chapter: {
      id: chapter.id,
      title: chapter.title,
      order: chapter.order,
      content: chapter.content ?? null,
      expectation: chapter.expectation ?? null,
      targetWordCount: chapter.targetWordCount ?? null,
      conflictLevel: chapter.conflictLevel ?? null,
      revealLevel: chapter.revealLevel ?? null,
      mustAvoid: chapter.mustAvoid ?? null,
      taskSheet: chapter.taskSheet ?? null,
      sceneCards: chapter.sceneCards ?? null,
      hook: chapter.hook ?? null,
      supportingContextText: "",
    },
    plan,
    canonicalState: null,
    nextAction: "write_chapter",
    chapterStateGoal: null,
    protectedSecrets: chapter.mustAvoid ? [chapter.mustAvoid] : [],
    pendingReviewProposalCount: 0,
    stateSnapshot: buildPreviewStateSnapshot({ novel, chapter, characters }),
    openConflicts: [],
    storyWorldSlice: null,
    characterRoster: characters,
    characterHardFacts,
    creativeDecisions: [],
    openAuditIssues: [],
    previousChaptersSummary: [],
    previousChapterTail: null,
    openingHint: "使用章节任务或场景卡直接开场，避免重复解释设定。",
    continuation: {
      enabled: false,
      sourceType: null,
      sourceId: null,
      sourceTitle: "",
      systemRule: "",
      humanBlock: "",
      antiCopyCorpus: [],
    },
    styleContext: {
      matchedBindings: [],
      compiledBlocks: {
        context: "",
        style: "",
        character: "",
        antiAi: "",
        output: "",
        selfCheck: "",
        contract: styleContract,
        mergedRules: {
          narrativeRules: {},
          characterRules: {},
          languageRules: {},
          rhythmRules: {},
        },
        appliedRuleIds: [],
      },
      effectiveStyleProfileId: null,
      taskStyleProfileId: null,
      activeSourceTargets: ["novel", "chapter"],
      activeSourceLabels: ["Prompt Workbench 预览"],
      maturity: "summary_only",
      usesGlobalAntiAiBaseline: false,
      globalAntiAiRuleIds: [],
      styleAntiAiRuleIds: [],
      sanitizedGenerationProfile: null,
    },
    characterDynamics: null,
    characterMindStates: [],
    bookContract: null,
    macroConstraints: null,
    volumeWindow: null,
    narrativeProgressHint: novel.estimatedChapterCount
      ? `第 ${chapter.order} 章 / 预计共 ${novel.estimatedChapterCount} 章。`
      : null,
    ledgerPendingItems: [],
    ledgerUrgentItems: [],
    ledgerOverdueItems: [],
    ledgerSummary: null,
    timelineContext: null,
    characterResourceContext: null,
    ragContext: "",
    chapterMission: null,
    chapterWriteContext: null,
    chapterReviewContext: null,
    chapterRepairContext: null,
    contextGatingDecisions: [],
    chapterChangeFlags: {
      introducedPayoff: false,
      payoffResolutionSignal: false,
      relationshipShiftSignal: false,
      majorStateShiftSignal: false,
    },
    tokenBudgetPolicy: {
      chapterBudgetProfile: "workbench-preview",
      stageTokenCap: {},
      retryCap: {},
      auditMode: "light",
    },
    promptBudgetProfiles: [],
  };
}

export function buildPreviewChapterWriteContext(input: {
  novel: PreviewNovelRow;
  chapter: PreviewChapterRow;
}): ChapterWriteContext {
  const { chapter, novel } = input;
  const contextPackage = buildPreviewGenerationContextPackage({ novel, chapter });
  const bookContract = buildBookContractContext({
    title: novel.title,
    targetAudience: novel.targetAudience,
    sellingPoint: novel.bookSellingPoint,
    first30ChapterPromise: novel.first30ChapterPromise,
    narrativePov: novel.narrativePov,
    pacePreference: novel.pacePreference,
    emotionIntensity: novel.emotionIntensity,
    toneGuardrails: [novel.styleTone].filter((item): item is string => Boolean(item?.trim())),
    hardConstraints: [chapter.mustAvoid].filter((item): item is string => Boolean(item?.trim())),
  });

  return buildChapterWriteContext({
    bookContract,
    macroConstraints: null,
    volumeWindow: null,
    contextPackage,
  });
}
