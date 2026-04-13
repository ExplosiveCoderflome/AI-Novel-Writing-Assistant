export type SceneWordControlMode = "prompt_only" | "balanced";

export interface SceneRoundPlanInput {
  sceneTargetWordCount: number;
  sceneMinWordCount: number;
  sceneMaxWordCount: number;
  chapterTargetWordCount: number;
  currentSceneWordCount: number;
  currentChapterWordCount: number;
  remainingChapterWordCount: number;
  roundIndex: number;
  mode?: SceneWordControlMode | null;
}

export interface SceneRoundPlan {
  mode: SceneWordControlMode;
  roundIndex: number;
  maxRounds: number;
  roundsLeft: number;
  sceneTargetWordCount: number;
  sceneMinWordCount: number;
  sceneMaxWordCount: number;
  currentSceneWordCount: number;
  currentChapterWordCount: number;
  remainingSceneWordCount: number;
  remainingChapterWordCount: number;
  suggestedRoundWordCount: number | null;
  hardRoundWordLimit: number | null;
  isFinalRound: boolean;
  closingPhase: boolean;
}

export interface SceneStreamLimitFlushResult {
  emittedText: string;
  remainingText: string;
  reachedLimit: boolean;
  trimmedAtSentenceBoundary: boolean;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function countSceneTextUnits(text: string | null | undefined): number {
  return (text ?? "").replace(/\s+/g, "").trim().length;
}

export function resolveSceneWordControlMode(input: {
  sceneTargetWordCount: number;
  requestedMode?: SceneWordControlMode | null;
}): SceneWordControlMode {
  if (input.requestedMode === "prompt_only" || input.requestedMode === "balanced") {
    return input.requestedMode;
  }
  return input.sceneTargetWordCount <= 650 ? "prompt_only" : "balanced";
}

export function estimateSceneRoundCount(
  sceneTargetWordCount: number,
  mode: SceneWordControlMode,
): number {
  if (mode === "prompt_only") {
    return 1;
  }
  if (sceneTargetWordCount <= 900) {
    return 2;
  }
  if (sceneTargetWordCount <= 1800) {
    return 3;
  }
  return 4;
}

export function buildSceneRoundPlan(input: SceneRoundPlanInput): SceneRoundPlan {
  const sceneTargetWordCount = Math.max(1, Math.round(input.sceneTargetWordCount));
  const sceneMinWordCount = Math.max(1, Math.round(input.sceneMinWordCount));
  const sceneMaxWordCount = Math.max(sceneMinWordCount, Math.round(input.sceneMaxWordCount));
  const chapterTargetWordCount = Math.max(1, Math.round(input.chapterTargetWordCount));
  const currentSceneWordCount = Math.max(0, Math.round(input.currentSceneWordCount));
  const currentChapterWordCount = Math.max(0, Math.round(input.currentChapterWordCount));
  const remainingChapterWordCount = Math.max(0, Math.round(input.remainingChapterWordCount));
  const mode = resolveSceneWordControlMode({
    sceneTargetWordCount,
    requestedMode: input.mode,
  });
  const maxRounds = estimateSceneRoundCount(sceneTargetWordCount, mode);
  const roundsLeft = Math.max(1, maxRounds - input.roundIndex + 1);
  const remainingSceneWordCount = Math.max(sceneTargetWordCount - currentSceneWordCount, 0);

  if (mode === "prompt_only") {
    return {
      mode,
      roundIndex: 1,
      maxRounds: 1,
      roundsLeft: 1,
      sceneTargetWordCount,
      sceneMinWordCount,
      sceneMaxWordCount,
      currentSceneWordCount,
      currentChapterWordCount,
      remainingSceneWordCount,
      remainingChapterWordCount,
      suggestedRoundWordCount: remainingSceneWordCount > 0 ? remainingSceneWordCount : null,
      hardRoundWordLimit: null,
      isFinalRound: true,
      closingPhase: true,
    };
  }

  const closingSceneThreshold = Math.max(180, Math.min(520, Math.floor(sceneTargetWordCount * 0.28)));
  const closingChapterThreshold = Math.max(220, Math.min(720, Math.floor(chapterTargetWordCount * 0.18)));
  const closingPhase = remainingSceneWordCount <= closingSceneThreshold
    || remainingChapterWordCount <= closingChapterThreshold
    || roundsLeft <= 2;
  const isFinalRound = roundsLeft === 1 || remainingSceneWordCount <= Math.max(120, Math.floor(sceneTargetWordCount * 0.14));

  let suggestedRoundWordCount: number | null;
  if (remainingSceneWordCount <= 0) {
    suggestedRoundWordCount = null;
  } else if (isFinalRound) {
    suggestedRoundWordCount = remainingSceneWordCount;
  } else if (closingPhase) {
    suggestedRoundWordCount = clamp(
      Math.ceil(remainingSceneWordCount / roundsLeft),
      120,
      Math.max(260, Math.ceil(sceneTargetWordCount * 0.35)),
    );
  } else {
    suggestedRoundWordCount = clamp(
      Math.ceil(remainingSceneWordCount / roundsLeft),
      160,
      Math.max(320, Math.ceil(sceneTargetWordCount * 0.65)),
    );
  }

  let hardRoundWordLimit: number | null = null;
  if (!isFinalRound && suggestedRoundWordCount && suggestedRoundWordCount > 0) {
    const reserveForLaterRounds = roundsLeft > 1 ? Math.max(80, (roundsLeft - 1) * 60) : 0;
    const chapterRemainingCap = Math.max(0, remainingChapterWordCount - reserveForLaterRounds);
    const sceneRemainingCap = Math.max(0, sceneMaxWordCount - currentSceneWordCount);
    const computedHardLimit = Math.min(
      Math.max(140, Math.ceil(suggestedRoundWordCount * 1.12)),
      sceneRemainingCap,
      chapterRemainingCap || sceneRemainingCap,
    );
    hardRoundWordLimit = computedHardLimit > 0 ? computedHardLimit : null;
  }

  return {
    mode,
    roundIndex: input.roundIndex,
    maxRounds,
    roundsLeft,
    sceneTargetWordCount,
    sceneMinWordCount,
    sceneMaxWordCount,
    currentSceneWordCount,
    currentChapterWordCount,
    remainingSceneWordCount,
    remainingChapterWordCount,
    suggestedRoundWordCount,
    hardRoundWordLimit,
    isFinalRound,
    closingPhase,
  };
}

function findFirstSentenceBoundary(text: string): number | null {
  for (let index = 0; index < text.length; index += 1) {
    if ("。！？!?；;\n".includes(text[index] ?? "")) {
      return index + 1;
    }
  }
  return null;
}

function takeTextByUnits(text: string, limitUnits: number): string {
  if (limitUnits <= 0) {
    return "";
  }
  let units = 0;
  const output: string[] = [];
  for (const char of text) {
    if (!char.match(/\s/)) {
      units += 1;
    }
    if (units > limitUnits) {
      break;
    }
    output.push(char);
  }
  return output.join("").trimEnd();
}

export function flushSceneStreamingBufferWithLimit(input: {
  alreadyEmitted: string;
  pendingText: string;
  hardLimit: number;
  forceFlushTail?: boolean;
}): SceneStreamLimitFlushResult {
  if (!input.pendingText) {
    return {
      emittedText: "",
      remainingText: "",
      reachedLimit: false,
      trimmedAtSentenceBoundary: false,
    };
  }

  const emittedParts: string[] = [];
  let remainingText = input.pendingText;
  let trimmedAtSentenceBoundary = false;

  while (true) {
    const sentenceBoundary = findFirstSentenceBoundary(remainingText);
    if (sentenceBoundary == null) {
      break;
    }
    const sentence = remainingText.slice(0, sentenceBoundary);
    const nextText = `${input.alreadyEmitted}${emittedParts.join("")}${sentence}`;
    if (countSceneTextUnits(nextText) > input.hardLimit) {
      return {
        emittedText: emittedParts.join(""),
        remainingText,
        reachedLimit: true,
        trimmedAtSentenceBoundary,
      };
    }
    emittedParts.push(sentence);
    remainingText = remainingText.slice(sentenceBoundary);
    trimmedAtSentenceBoundary = true;
  }

  if (input.forceFlushTail && remainingText) {
    const nextText = `${input.alreadyEmitted}${emittedParts.join("")}${remainingText}`;
    if (countSceneTextUnits(nextText) <= input.hardLimit) {
      emittedParts.push(remainingText);
      remainingText = "";
    } else if (emittedParts.length === 0) {
      const truncated = takeTextByUnits(
        remainingText,
        Math.max(0, input.hardLimit - countSceneTextUnits(input.alreadyEmitted)),
      );
      return {
        emittedText: truncated,
        remainingText: "",
        reachedLimit: true,
        trimmedAtSentenceBoundary: false,
      };
    } else {
      return {
        emittedText: emittedParts.join(""),
        remainingText,
        reachedLimit: true,
        trimmedAtSentenceBoundary,
      };
    }
  }

  return {
    emittedText: emittedParts.join(""),
    remainingText,
    reachedLimit: false,
    trimmedAtSentenceBoundary,
  };
}
