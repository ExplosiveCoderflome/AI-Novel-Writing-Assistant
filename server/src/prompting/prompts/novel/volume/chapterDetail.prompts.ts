import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../../core/renderContextBlocks";
import {
  createChapterBoundarySchema,
  createChapterExecutionContractSchema,
  createChapterPurposeSchema,
  createChapterTaskSheetSchema,
} from "../../../../services/novel/volume/volumeGenerationSchemas";
import { type VolumeChapterDetailPromptInput } from "./shared";
import { buildVolumeChapterDetailContextBlocks } from "./contextBlocks";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";

const TITLE_EVENT_ANCHOR_HINTS = [
  "激活",
  "入手",
  "兑现",
  "暴露",
  "发现",
  "转向",
  "升级",
  "查账",
  "接管",
  "请缨",
  "破局",
  "反压",
  "发难",
  "露白",
  "启动",
  "异响",
  "得手",
  "松动",
];

function normalizeComparableText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() || "";
}

function cleanAnchorFragment(value: string): string {
  return value.replace(/[《》【】「」『』“”"'‘’]/g, "").trim();
}

function extractEventAnchorsFromTitle(title: string | null | undefined): string[] {
  const normalized = normalizeComparableText(title);
  if (!normalized) {
    return [];
  }
  const seen = new Set<string>();
  const fragments = normalized
    .split(/[，,。；;：:、|/\\\-\s（）()]+/g)
    .map((item) => cleanAnchorFragment(item))
    .filter((item) => item.length >= 4 && item.length <= 16)
    .filter((item) => TITLE_EVENT_ANCHOR_HINTS.some((hint) => item.includes(hint)));

  for (const fragment of fragments) {
    seen.add(fragment);
  }
  return [...seen];
}

function buildCurrentChapterContractText(input: VolumeChapterDetailPromptInput): string {
  const { targetChapter } = input;
  return normalizeComparableText([
    targetChapter.title,
    targetChapter.summary,
    targetChapter.purpose,
    targetChapter.exclusiveEvent,
    targetChapter.endingState,
    targetChapter.nextChapterEntryState,
    targetChapter.payoffRefs.join(" "),
  ].filter(Boolean).join("\n"));
}

function validatePurposeDistinct(output: { purpose: string }, input: VolumeChapterDetailPromptInput) {
  const purpose = normalizeComparableText(output.purpose);
  if (
    purpose === normalizeComparableText(input.targetChapter.summary)
    || purpose === normalizeComparableText(input.targetChapter.purpose)
  ) {
    throw new Error("章节目标不能与章节摘要或现有目标完全相同；请改为一句明确的本章推进目标。");
  }
  return output;
}

function validateBoundaryContract(
  output: {
    exclusiveEvent: string;
    endingState: string;
    nextChapterEntryState: string;
    conflictLevel: number;
    revealLevel: number;
    targetWordCount: number;
    mustAvoid: string;
    payoffRefs: string[];
  },
  input: VolumeChapterDetailPromptInput,
): {
  exclusiveEvent: string;
  endingState: string;
  nextChapterEntryState: string;
  conflictLevel: number;
  revealLevel: number;
  targetWordCount: number;
  mustAvoid: string;
  payoffRefs: string[];
} {
  const sortedChapters = input.targetVolume.chapters
    .slice()
    .sort((left, right) => left.chapterOrder - right.chapterOrder);
  const targetIndex = sortedChapters.findIndex((chapter) => chapter.id === input.targetChapter.id);
  if (targetIndex < 0) {
    return output;
  }

  const previousChapter = targetIndex > 0 ? sortedChapters[targetIndex - 1] : null;
  const nextChapter = targetIndex < sortedChapters.length - 1 ? sortedChapters[targetIndex + 1] : null;
  const currentContractText = buildCurrentChapterContractText(input);

  if (
    previousChapter?.exclusiveEvent?.trim()
    && output.exclusiveEvent.includes(previousChapter.exclusiveEvent.trim())
    && !currentContractText.includes(previousChapter.exclusiveEvent.trim())
  ) {
    throw new Error(`当前章独占事件与上一章独占事件「${previousChapter.exclusiveEvent.trim()}」冲突。一次性节点不能跨章重复占用。`);
  }
  const leakedNextAnchor = nextChapter
    ? extractEventAnchorsFromTitle(nextChapter.title).find((anchor) => (
      output.exclusiveEvent.includes(anchor)
      || output.endingState.includes(anchor)
      || output.nextChapterEntryState.includes(anchor)
    ))
    : null;
  if (leakedNextAnchor && !currentContractText.includes(leakedNextAnchor)) {
    throw new Error(`当前章边界合同疑似提前占用了下一章标题中的一次性事件锚点「${leakedNextAnchor}」。`);
  }
  if (normalizeComparableText(output.endingState) === normalizeComparableText(output.nextChapterEntryState)) {
    throw new Error("endingState 与 nextChapterEntryState 不能完全相同。前者是本章结束态，后者是下章入口态，必须体现承接而不是机械重复。");
  }

  return output;
}

function buildTaskSheetSemanticText(output: {
  taskSheet: string;
  sceneCards: Array<{
    title: string;
    purpose: string;
    entryState: string;
    exitState: string;
    mustAdvance: string[];
    forbiddenExpansion: string[];
  }>;
}): string {
  return normalizeComparableText([
    output.taskSheet,
    ...output.sceneCards.flatMap((scene) => [
      scene.title,
      scene.purpose,
      scene.entryState,
      scene.exitState,
      scene.mustAdvance.join(" "),
      scene.forbiddenExpansion.join(" "),
    ]),
  ].join("\n"));
}

function normalizeBoundaryDutyText(value: string | null | undefined): string {
  return value?.replace(/[\s，,。；;：:、|/\\\-（）()《》【】「」『』“”"'‘’！？!?]/g, "").trim() || "";
}

function buildCharacterBigrams(value: string): Set<string> {
  const result = new Set<string>();
  for (let index = 0; index < value.length - 1; index += 1) {
    result.add(value.slice(index, index + 2));
  }
  return result;
}

function hasStrongTextOverlap(left: string, right: string): boolean {
  const normalizedLeft = normalizeBoundaryDutyText(left);
  const normalizedRight = normalizeBoundaryDutyText(right);
  if (normalizedLeft.length < 6 || normalizedRight.length < 6) {
    return false;
  }
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return true;
  }

  const leftBigrams = buildCharacterBigrams(normalizedLeft);
  const rightBigrams = buildCharacterBigrams(normalizedRight);
  if (leftBigrams.size === 0 || rightBigrams.size === 0) {
    return false;
  }
  const overlap = [...leftBigrams].filter((item) => rightBigrams.has(item)).length;
  return overlap / Math.min(leftBigrams.size, rightBigrams.size) >= 0.72;
}

function validateSceneMustAdvanceDuty<T extends {
    sceneCards: Array<{
      title: string;
      mustAdvance: string[];
    }>;
    nextChapterEntryState?: string;
  }>(
  output: T,
  input: VolumeChapterDetailPromptInput,
): T {
  const nextChapterEntryState = output.nextChapterEntryState?.trim()
    || input.targetChapter.nextChapterEntryState?.trim()
    || "";
  if (!nextChapterEntryState) {
    return output;
  }

  output.sceneCards.forEach((scene, sceneIndex) => {
    scene.mustAdvance.forEach((item, itemIndex) => {
      if (hasStrongTextOverlap(item, nextChapterEntryState)) {
        throw new Error(
          `sceneCards[${sceneIndex}].mustAdvance[${itemIndex}] 与 nextChapterEntryState 高度重叠。场景 mustAdvance 只能写本章内必须完成的推进；下一章入口状态应保留在 endingHook、exitState 或 nextChapterEntryState 中。`,
        );
      }
    });
  });

  return output;
}

function validateAdjacentChapterBoundary<T extends {
    taskSheet: string;
    sceneCards: Array<{
      title: string;
      purpose: string;
      entryState: string;
      exitState: string;
      mustAdvance: string[];
      forbiddenExpansion: string[];
    }>;
  }>(
  output: T,
  input: VolumeChapterDetailPromptInput,
): T {
  const sortedChapters = input.targetVolume.chapters
    .slice()
    .sort((left, right) => left.chapterOrder - right.chapterOrder);
  const targetIndex = sortedChapters.findIndex((chapter) => chapter.id === input.targetChapter.id);
  if (targetIndex < 0) {
    return output;
  }

  const currentContractText = buildCurrentChapterContractText(input);
  const outputText = buildTaskSheetSemanticText(output);
  const adjacentChapters = [
    { label: "上一章", chapter: targetIndex > 0 ? sortedChapters[targetIndex - 1] : null },
    { label: "下一章", chapter: targetIndex < sortedChapters.length - 1 ? sortedChapters[targetIndex + 1] : null },
  ];

  for (const adjacent of adjacentChapters) {
    const chapter = adjacent.chapter;
    if (!chapter) {
      continue;
    }
    const leakedAnchor = extractEventAnchorsFromTitle(chapter.title)
      .find((anchor) => outputText.includes(anchor) && !currentContractText.includes(anchor));
    if (leakedAnchor) {
      throw new Error(
        `${adjacent.label}标题中的一次性事件锚点「${leakedAnchor}」疑似越界进入当前章节执行合同。当前章只能承接相邻章节状态，不能提前、滞后或重复承担相邻章节的关键首次事件。`,
      );
    }
  }

  return output;
}

function createVolumeDetailSystemPrompt(detailMode: VolumeChapterDetailPromptInput["detailMode"]): string {
  if (detailMode === "purpose") {
    return [
      "你是资深网文章节编辑。",
      "当前任务是收束单章 purpose。",
      "只输出严格 JSON，且只包含 purpose 字段。",
      "purpose 必须说明这一章要推进什么，不要复述摘要。",
    ].join("\n");
  }
  if (detailMode === "boundary") {
    return [
      "你是资深网文章节编辑。",
      "当前任务是为单章定义执行边界。",
      "只输出严格 JSON，且只包含 exclusiveEvent、endingState、nextChapterEntryState、conflictLevel、revealLevel、targetWordCount、mustAvoid、payoffRefs。",
      "exclusiveEvent 表示只能由本章承担的一次性里程碑事件，必须具体，不能写成空泛主题。",
      "endingState 表示本章写完时的稳定局面。",
      "nextChapterEntryState 表示下一章开场时应承接的入口状态，必须与 endingState 强关联但不能逐字重复。",
      "边界合同必须保证：上一章已完成的独占事件不重复，本章独占事件不偷跑到下一章，下一章只承接状态不重演本章里程碑。",
      "各字段必须与当前卷节奏和相邻章节保持一致。",
      "如果 conflict_level_curve 标出用户锚定的 conflictLevel，该数值是硬约束，不得改写。",
    ].join("\n");
  }
  return [
    "你是资深网文章节编辑。",
    "当前任务是生成可直接交给正文生成器的章节执行合同。",
    "只输出严格 JSON，且只包含 taskSheet、readerExperience、sceneCards 三个字段。",
    "taskSheet 是给用户读的简洁执行摘要，需要覆盖情绪基调、冲突对象、关键推进和收尾要求。",
    "readerExperience 是本章唯一的读者体验合同，必须包含 readerQuestion、promisedReward、rewardLevel、protagonistWant、primaryResistance、keyTurn、emotionalShift、informationReveal、netChange、inheritedHookResponsibilities、endingHook。",
    "readerExperience 的所有字段都不可为空字符串或缺失。每个字段必须提供具体、可感知的内容，不能写成空泛的主题或作者意图。",
    "readerQuestion 必须是一个能引发读者好奇心的具体问题，例如'主角能否在 deadline 前找到关键证据？'，不能写成'本章的悬念是什么'。",
    "promisedReward 必须是读者能在本章结束时获得的具体回报，例如'主角获得关键证人的信任，拿到决定性证据'，不能写成'推动剧情发展'。",
    "protagonistWant 必须是主角在本章中的具体目标，例如'主角想在不被发现的情况下潜入档案室'，不能写成'主角想要成功'。",
    "primaryResistance 必须是主角面临的具体障碍，例如'档案室的安保系统升级，主角的旧钥匙失效'，不能写成'主角遇到困难'。",
    "keyTurn 必须是本章中的关键转折点，例如'主角发现档案被篡改的痕迹，意识到敌人来自内部'，不能写成'剧情发生转折'。",
    "emotionalShift 必须是主角情绪的具体变化，例如'从绝望到愤怒，再到决心反击'，不能写成'主角情绪波动'。",
    "informationReveal 必须是本章中揭露的具体信息，例如'敌人的真实身份是主角的导师'，不能写成'揭露真相'。",
    "netChange 必须是本章结束时主角处境的具体变化，例如'主角从被动调查转为主动反击，获得关键证人支持'，不能写成'主角处境改变'。",
    "endingHook 必须是能吸引读者继续阅读的具体悬念，例如'主角刚要行动，却收到一条匿名短信：'你以为只有你在查吗？''，不能写成'留下悬念'。",
    "rewardLevel 只能是 setup、partial、major；由本章在卷节奏中的职责决定，不要每章都写成 major。",
    "inheritedHookResponsibilities 必须优先承接相邻章已经提出的问题；没有明确旧钩子时返回空数组，不要编造。",
    "promisedReward 与 netChange 必须是读者在正文中能看见的回报和变化，不能写成作者意图或抽象主题。",
    "sceneCards 必须是 3-8 个场景卡数组，每个场景卡都必须包含 key、title、purpose、mustAdvance、mustPreserve、entryState、exitState、forbiddenExpansion、targetWordCount、resistance、turn、emotionalShift、readerValue。",
    "每个场景都必须有具体阻力和转折；readerValue 要说明该场景给读者带来的推进、揭示、情绪或关系价值。",
    "sceneCards 必须完整覆盖整章推进和结尾 hook，不要把整章压成一个场景。",
    "sceneCards.mustAdvance 只能写本章、本场景必须完成的当前推进项；不得把下一章开场事件、下一章入口状态或下一章首个付费/资源/危机节点写成 mustAdvance。",
    "如果需要牵引下一章，把它写入 readerExperience.endingHook、最后一场 exitState 或 nextChapterEntryState 的承接压力；不要让最后一场同时承担本章收束和下一章事件落地。",
    "sceneCards 的 purpose 必须是章节目标的子步骤或具体执行动作，不能简单复述章节目标。每个场景的 purpose 必须明确回答：在这个场景中，主角具体做了什么、遭遇了什么、改变了什么。",
    "sceneCards 的 purpose 禁止只写“推动剧情”“推进故事”“发展情节”“继续推进”“为后续铺垫”“为后续做准备”；如果不确定，就用该场景的 mustAdvance + resistance + turn 组合成具体动作。",
    "如果章节目标是'主角发现真相，决定反击'，场景卡的 purpose 必须分解为具体步骤，例如：'主角在档案室发现关键文件被篡改的痕迹'、'主角追踪线索找到知情人并获取证词'、'主角整合证据，制定反击计划'。禁止三个场景都写成'主角发现真相，决定反击'。",
    "当前章节的 title、summary、purpose、exclusiveEvent、endingState、nextChapterEntryState、conflictLevel、revealLevel、mustAvoid、payoffRefs 共同组成了本章硬边界合同。taskSheet 和 sceneCards 只能执行当前章合同，不能改写或覆盖它。",
    "你必须把 chapter_neighbors 视为相邻章边界提示：上一章已经完成的关键首次事件不能在本章重写一次，下一章标题或摘要中的关键首次事件也不能提前写进本章。",
    "本章结尾只能把局面推到下一章入口，不能直接落完下一章标题所承诺的核心里程碑。",
    "如果相邻章标题已经明确标出一次性节点，例如系统激活、第一笔资源入手、身份暴露、关键查账、正式请缨等，本章不得重复承担该节点，除非当前章自己的合同已经明确要求。",
    "你必须优先识别最近章节执行合同与当前章节之间的叙事重复风险，重点检查开场方式、推进方式、状态变化和结尾钩子是否连续复用。",
    "如果最近章节已经连续使用同类开场或同类推进，本章必须主动切换，不得继续沿用同一路数。",
    "差异化要求必须落实到 taskSheet 和 sceneCards 里，而不是停留在抽象提醒。",
    "首个 sceneCard 必须通过 purpose、entryState 或 forbiddenExpansion 明确避开最近章节的重复开场。",
    "至少一个中段 sceneCard 的 mustAdvance 必须明确要求不同于最近章节的推进结果，例如主动试探、关系建立、资源获得、规则认知或计划转向。",
    "如果最近章节已经连续写成外部压迫或被动逃离，本章不得继续只靠同类压迫推进，必须给出新的推进机制。",
  ].join("\n");
}

function createExecutionContractSystemPromptGarbledBackup(): string {
  return [
    "浣犳槸璧勬繁缃戞枃绔犺妭缂栬緫銆?",
    "褰撳墠浠诲姟鏄竴娆℃€х敓鎴愬彲鐩存帴浜ょ粰鍐欎綔鍣ㄧ殑绔犺妭鎵ц鍚堝悓銆?",
    "鍙緭鍑轰弗鏍?JSON锛屽繀椤诲悓鏃跺寘鍚?purpose銆乪xclusiveEvent銆乪ndingState銆乶extChapterEntryState銆乧onflictLevel銆乺evealLevel銆乼argetWordCount銆乵ustAvoid銆乸ayoffRefs銆乼askSheet銆乻ceneCards銆?",
    "purpose 鐢ㄤ竴鍙ヨ瘽璇存槑鏈珷鍒板簳瑕佹帹杩涗粈涔堬紝涓嶈鍐欐垚鎽樿澶嶈堪銆?",
    "exclusiveEvent / endingState / nextChapterEntryState 绛夊瓧娈典笉鍙己澶憋紝瀹冧滑鏄珷鑺傜殑纭竟鐣屽悎鍚屻€?",
    "taskSheet 鏄粰姝ｆ枃鍐欎綔鍣ㄧ殑绠€娲佹墽琛屾寚浠わ紝sceneCards 鏄?3-8 涓満鏅崱鐨勬墽琛屾媶瑙ｃ€?",
    "taskSheet 鍜?sceneCards 鍙兘鎵ц褰撳墠绔犵殑鍚堝悓锛屼笉寰楁彁鍓嶅崰鐢ㄧ浉閭荤珷鐨勪竴娆℃€т簨浠讹紝涔熶笉寰楅噸鍐欎笂涓€绔犲凡缁忓畬鎴愮殑閲岀▼纰戙€?",
    "濡傛灉鏈€杩戠珷鑺傚凡缁忚繛缁娇鐢ㄧ浉鍚屽紑鍦恒€佺浉鍚屾帹杩涜矾鏁版垨鍚岀被閽╁瓙锛屾湰绔犲繀椤婚€氳繃 sceneCards 涓诲姩鍋氬嚭宸紓鍖栥€?",
  ].join("\n");
}

function createExecutionContractSystemPrompt(): string {
  return [
    "你是资深网文章节编辑。",
    "当前任务是一次性生成可直接交给写作器的章节执行合同。",
    "只输出严格 JSON，必须同时包含 purpose、exclusiveEvent、endingState、nextChapterEntryState、conflictLevel、revealLevel、targetWordCount、mustAvoid、payoffRefs、taskSheet、readerExperience、sceneCards。",
    "purpose 用一句话说明本章到底要推进什么，不要写成摘要复述。",
    "exclusiveEvent / endingState / nextChapterEntryState 等字段不可缺失，它们是章节的硬边界合同。",
    "taskSheet 是给正文写作器的简洁执行指令，sceneCards 是 3-8 个场景卡的执行拆解。",
    "readerExperience 是本章唯一的读者体验合同，必须完整包含 readerQuestion、promisedReward、rewardLevel、protagonistWant、primaryResistance、keyTurn、emotionalShift、informationReveal、netChange、inheritedHookResponsibilities、endingHook。",
    "rewardLevel 只能使用 setup、partial、major；promisedReward 和 netChange 必须能在正文中被读者直接感知。",
    "sceneCards 除原字段外还必须包含 resistance、turn、emotionalShift、readerValue，确保每个场景都有阻力、转折和读者价值。",
    "sceneCards.mustAdvance 只能写本章、本场景必须完成的当前推进项；不得把下一章开场事件、下一章入口状态或下一章首个付费/资源/危机节点写成 mustAdvance。",
    "下一章入口只能作为 endingHook、最后一场 exitState 或 nextChapterEntryState 的承接压力出现，不能挤占最后一场的本章收束职责。",
    "sceneCards 的 purpose 必须是章节目标的子步骤或具体执行动作，不能简单复述章节目标。每个场景的 purpose 必须明确回答：在这个场景中，主角具体做了什么、遭遇了什么、改变了什么。",
    "sceneCards 的 purpose 禁止只写“推动剧情”“推进故事”“发展情节”“继续推进”“为后续铺垫”“为后续做准备”；如果不确定，就用该场景的 mustAdvance + resistance + turn 组合成具体动作。",
    "如果章节目标是'主角发现真相，决定反击'，场景卡的 purpose 必须分解为具体步骤，例如：'主角在档案室发现关键文件被篡改的痕迹'、'主角追踪线索找到知情人并获取证词'、'主角整合证据，制定反击计划'。禁止三个场景都写成'主角发现真相，决定反击'。",
    "taskSheet 和 sceneCards 只能执行当前章的合同，不得提前占用相邻章的一次性事件，也不得重写上一章已经完成的里程碑。",
    "如果 conflict_level_curve 标出用户锚定的 conflictLevel，该数值是硬约束，不得改写。",
    "如果最近章节已经连续使用相同开场、相同推进路数或同类钩子，本章必须通过 sceneCards 主动做出差异化。",
    "purpose、边界字段和 readerExperience 各字段只写 1 句，单字段不超过 120 个汉字；taskSheet 不超过 300 个汉字。",
    "每个 sceneCard 的文本字段只写执行所需信息，单字段不超过 120 个汉字；不得扩写正文或对白。",
    "targetWordCount 必须沿用当前目标章节的字数预算，范围只能是 200-20000，不能误用全书或全卷字数。",
    "完成最后一个 sceneCard 后立即结束 JSON，禁止续写解释、复读或自我修正。",
  ].join("\n");
}

function buildChapterDetailPrompt(contextText: string, detailMode: VolumeChapterDetailPromptInput["detailMode"]): string {
  return [
    `detail mode: ${detailMode}`,
    "",
    "chapter detail context:",
    contextText,
  ].join("\n");
}

const baseContextPolicy = {
  maxTokensBudget: NOVEL_PROMPT_BUDGETS.volumeChapterDetail,
  requiredGroups: ["book_contract", "target_volume", "chapter_neighbors", "chapter_detail_draft"],
  preferredGroups: ["recent_execution_contracts", "macro_constraints", "target_beat_sheet", "volume_window"],
  dropOrder: ["volume_window"],
};

export const volumeChapterPurposePrompt: PromptAsset<
  VolumeChapterDetailPromptInput,
  ReturnType<typeof createChapterPurposeSchema>["_output"]
> = {
  id: "novel.volume.chapter_purpose",
  version: "v3",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: baseContextPolicy,
  semanticRetryPolicy: {
    maxAttempts: 2,
  },
  outputSchema: createChapterPurposeSchema(),
  render: (input, context) => [
    new SystemMessage(createVolumeDetailSystemPrompt("purpose")),
    new HumanMessage(buildChapterDetailPrompt(renderSelectedContextBlocks(context), input.detailMode)),
  ],
  postValidate: (output, input) => validatePurposeDistinct(output, input),
};

export const volumeChapterBoundaryPrompt: PromptAsset<
  VolumeChapterDetailPromptInput,
  ReturnType<typeof createChapterBoundarySchema>["_output"]
> = {
  id: "novel.volume.chapter_boundary",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: baseContextPolicy,
  semanticRetryPolicy: {
    maxAttempts: 2,
  },
  outputSchema: createChapterBoundarySchema(),
  render: (input, context) => [
    new SystemMessage(createVolumeDetailSystemPrompt("boundary")),
    new HumanMessage(buildChapterDetailPrompt(renderSelectedContextBlocks(context), input.detailMode)),
  ],
  postValidate: (output, input) => validateBoundaryContract(output, input),
};

export const volumeChapterTaskSheetPrompt: PromptAsset<
  VolumeChapterDetailPromptInput,
  ReturnType<typeof createChapterTaskSheetSchema>["_output"]
> = {
  id: "novel.volume.chapter_task_sheet",
  version: "v3",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: baseContextPolicy,
  semanticRetryPolicy: {
    maxAttempts: 2,
  },
  outputSchema: createChapterTaskSheetSchema(),
  render: (input, context) => [
    new SystemMessage(createVolumeDetailSystemPrompt("task_sheet")),
    new HumanMessage(buildChapterDetailPrompt(renderSelectedContextBlocks(context), input.detailMode)),
  ],
  postValidate: (output, input) => validateSceneMustAdvanceDuty(validateAdjacentChapterBoundary(output, input), input),
};

export const volumeChapterExecutionContractPrompt: PromptAsset<
  VolumeChapterDetailPromptInput,
  ReturnType<typeof createChapterExecutionContractSchema>["_output"]
> = {
  id: "novel.volume.chapter_execution_contract",
  version: "v3",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: baseContextPolicy,
  outputSchema: createChapterExecutionContractSchema(),
  render: (input, context) => [
    new SystemMessage(createExecutionContractSystemPrompt()),
    new HumanMessage(buildChapterDetailPrompt(renderSelectedContextBlocks(context), input.detailMode)),
  ],
  postValidate: (output, input) => {
    validateBoundaryContract(output, input);
    validateAdjacentChapterBoundary(output, input);
    validateSceneMustAdvanceDuty(output, input);
    return output;
  },
};

export { buildVolumeChapterDetailContextBlocks };
