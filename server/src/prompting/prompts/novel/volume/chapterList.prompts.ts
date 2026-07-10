import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../../core/renderContextBlocks";
import { createVolumeChapterBeatBlockSchema } from "../../../../services/novel/volume/volumeGenerationSchemas";
import { type VolumeChapterListPromptInput } from "./shared";
import { buildVolumeChapterListContextBlocks } from "./contextBlocks";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";
import {
  getChapterTitleDiversityIssue,
  isBlockingChapterTitleQualityIssue,
  isChapterTitleDiversityIssue,
} from "../../../../services/novel/volume/chapterTitleDiversity";

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function buildRetryDirective(reason?: string | null): string {
  const normalizedReason = reason?.trim();
  if (!normalizedReason) {
    return "";
  }

  return [
    "上一次输出没有通过业务校验，本次必须优先修正：",
    normalizedReason,
    "先判断失败类型：标题结构、标题基础质量、章节功能、摘要推进、结尾牵引。",
    "不要只替换被点名的一章；如果问题来自标题同构或章节功能重复，必须重排整组标题骨架和章节功能分配。",
  ].join("\n");
}

function classifyChapterListRetryIssue(reason: string): string {
  if (isChapterTitleDiversityIssue(reason)) {
    return "标题结构：重排整组标题骨架，混用动作推进型、冲突压迫型、异常发现型、结果兑现型、决断转向型和问题钩子型。";
  }
  if (isBlockingChapterTitleQualityIssue(reason)) {
    return "标题基础质量：标题必须短促客观，不能第一人称、不能过长、不能写成完整剧情句。";
  }
  if (reason.includes("章节中主角或核心视角角色的主动行动不足") || reason.includes("连续多章呈现被动推进")) {
    return "章节功能：重排每章职责，让核心视角角色主动选择、试探、反击、布局、交换、隐忍或承担代价。";
  }
  if (reason.includes("过多章节摘要偏空泛")) {
    return "摘要推进：每章 summary 必须写出新增信息、局面变化、冲突推进、关系变化、资源得失或风险转向。";
  }
  if (reason.includes("当前节奏段缺少阶段性兑现") || reason.includes("结尾章缺少当前 beat")) {
    return "结尾牵引：最后一章必须完成当前 beat 的阶段兑现、明确转向或进入下一 beat 的阅读压力。";
  }
  return "综合质量：按失败原因重排标题、章节功能和摘要推进，保证每章都有新增变化。";
}

function resolvePromptConfig(
  input:
    | number
    | {
        targetChapterCount: number;
        targetBeatKey?: string;
        targetBeatLabel?: string | null;
      },
): {
  targetChapterCount: number;
  targetBeatKey: string;
  targetBeatLabel: string;
} {
  if (typeof input === "number") {
    return {
      targetChapterCount: input,
      targetBeatKey: "target_beat",
      targetBeatLabel: "目标节奏段",
    };
  }

  return {
    targetChapterCount: input.targetChapterCount,
    targetBeatKey: input.targetBeatKey?.trim() || "target_beat",
    targetBeatLabel: input.targetBeatLabel?.trim() || "目标节奏段",
  };
}

/**
 * 轻量章节功能质量检测。
 *
 * 目的：
 * - 不代替 LLM Critic；
 * - 只拦截最常见的低质量章节块：
 *   1. 连续多章只是调查/发现/意识到；
 *   2. summary 大量空泛；
 *   3. 缺少主角行动；
 *   4. 结尾章没有兑现/转向/钩子。
 *
 * 后续可以把这个函数升级成：
 * - chapterFunctionDiversity.ts
 * - 或一个独立 LLM quality critic 节点。
 */
function getChapterFunctionQualityIssue(
  chapters: Array<{
    title: string;
    summary: string;
    beatKey: string;
  }>,
): string | null {
  if (!chapters.length) {
    return "章节列表不能为空。";
  }

  const summaries = chapters.map((chapter) => chapter.summary.trim());
  const titles = chapters.map((chapter) => chapter.title.trim());

  const vagueSummaryPatterns = [
    /进一步推动/,
    /逐渐展开/,
    /局势变得复杂/,
    /为后续.*铺垫/,
    /埋下伏笔/,
    /产生影响/,
    /意识到.*重要/,
    /发现.*不简单/,
    /开始重视/,
  ];

  const passivePatterns = [
    /得知/,
    /听说/,
    /被告知/,
    /发现/,
    /意识到/,
    /察觉/,
    /局势.*变化/,
    /危机.*出现/,
  ];

  const activePatterns = [
    /决定/,
    /选择/,
    /试探/,
    /反击/,
    /布局/,
    /交换/,
    /逼迫/,
    /隐瞒/,
    /揭穿/,
    /设局/,
    /追查/,
    /拒绝/,
    /承认/,
    /利用/,
    /夺回/,
    /放弃/,
    /承担/,
    /压下/,
    /转向/,
  ];

  const payoffPatterns = [
    /兑现/,
    /反转/,
    /揭开/,
    /坐实/,
    /落定/,
    /反击/,
    /胜出/,
    /败露/,
    /失控/,
    /转向/,
    /代价/,
    /后手/,
    /陷阱/,
    /威胁/,
    /逼到/,
    /不得不/,
  ];

  const hookPatterns = [
    /但/,
    /却/,
    /反而/,
    /没想到/,
    /真正/,
    /背后/,
    /代价/,
    /后手/,
    /陷阱/,
    /更大的/,
    /新的/,
    /逼迫/,
    /不得不/,
    /暴露/,
    /留下/,
  ];

  const vagueCount = summaries.filter((summary) =>
    vagueSummaryPatterns.some((pattern) => pattern.test(summary)),
  ).length;

  if (chapters.length >= 4 && vagueCount >= Math.ceil(chapters.length / 2)) {
    return "过多章节摘要偏空泛，不能大量使用“进一步推动 / 局势复杂 / 为后续铺垫 / 埋下伏笔”等低信息密度表达。";
  }

  const activeCount = summaries.filter((summary) =>
    activePatterns.some((pattern) => pattern.test(summary)),
  ).length;

  if (chapters.length >= 4 && activeCount < Math.ceil(chapters.length / 3)) {
    return "章节中主角或核心视角角色的主动行动不足，不能让多数章节只是外部事件发生或角色被动得知信息。";
  }

  let consecutivePassive = 0;
  for (const summary of summaries) {
    const isPassive = passivePatterns.some((pattern) => pattern.test(summary));
    const isActive = activePatterns.some((pattern) => pattern.test(summary));

    if (isPassive && !isActive) {
      consecutivePassive += 1;
    } else {
      consecutivePassive = 0;
    }

    if (consecutivePassive >= 3) {
      return "连续多章呈现被动推进，例如只是发现、得知、意识到或局势变化，需要改成主动选择、试探、反击、布局或承担代价。";
    }
  }

  if (chapters.length >= 5) {
    const hasPayoffOrTurn = summaries.some((summary) =>
      payoffPatterns.some((pattern) => pattern.test(summary)),
    );

    if (!hasPayoffOrTurn) {
      return "当前节奏段缺少阶段性兑现、转折、反击、代价或局面反转，不能全是平滑铺垫。";
    }
  }

  const lastSummary = summaries[summaries.length - 1] ?? "";
  const lastTitle = titles[titles.length - 1] ?? "";

  const lastHasPayoffOrHook =
    payoffPatterns.some((pattern) => pattern.test(lastSummary)) ||
    hookPatterns.some((pattern) => pattern.test(lastSummary)) ||
    hookPatterns.some((pattern) => pattern.test(lastTitle));

  if (chapters.length >= 3 && !lastHasPayoffOrHook) {
    return "结尾章缺少当前 beat 的阶段兑现、明确转向或进入下一 beat 的阅读牵引。";
  }

  return null;
}

function isChapterFunctionQualityIssue(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return (
    message.includes("章节中主角或核心视角角色的主动行动不足") ||
    message.includes("连续多章呈现被动推进") ||
    message.includes("当前节奏段缺少阶段性兑现") ||
    message.includes("结尾章缺少当前 beat") ||
    message.includes("过多章节摘要偏空泛")
  );
}

export function createVolumeChapterListPrompt(
  input:
    | number
    | {
        targetChapterCount: number;
        targetBeatKey?: string;
        targetBeatLabel?: string | null;
      },
): PromptAsset<
  VolumeChapterListPromptInput,
  ReturnType<typeof createVolumeChapterBeatBlockSchema>["_output"]
> {
  const { targetChapterCount, targetBeatKey, targetBeatLabel } =
    resolvePromptConfig(input);

  return {
    id: "novel.volume.chapter_list",
    version: "v7",
    taskType: "planner",
    mode: "structured",
    language: "zh",

    contextPolicy: {
      maxTokensBudget: NOVEL_PROMPT_BUDGETS.volumeChapterList,
      requiredGroups: ["book_contract", "target_volume", "target_beat_contract"],
      preferredGroups: [
        "macro_constraints",
        "beat_context_window",
        "previous_beat_chapters",
        "preserved_beat_chapters",
        "adjacent_volumes",
        "soft_future_summary",
      ],
      dropOrder: ["soft_future_summary"],
    },

    semanticRetryPolicy: {
      maxAttempts: 2,
      buildMessages: ({
        attempt,
        baseMessages,
        parsedOutput,
        validationError,
      }) => {
        const normalizedValidationError = validationError?.trim() || "未通过章节列表业务校验。";
        const retryIssueClass = classifyChapterListRetryIssue(normalizedValidationError);
        return [
          ...baseMessages,
          new HumanMessage(
            [
              `上一次章节块通过了 JSON 结构校验，但没有通过业务校验。这是第 ${attempt} 次语义重试。`,
              `失败原因：${normalizedValidationError}`,
              `失败类型：${retryIssueClass}`,
              "",
              "重写要求：",
              "1. 只重写当前节奏段的章节列表，不得越界生成其他节奏段章节。",
              "2. 必须保留原有章节位数，最终 chapters.length 仍然必须等于目标章数。",
              "3. 必须先按失败类型修复：标题结构问题重排整组标题骨架；标题基础质量问题重写所有不合格标题；章节功能问题重排每章职责；摘要推进问题重写所有空泛摘要；结尾牵引问题重写末章的兑现和转向。",
              "4. 不要只局部替换触发校验的一章；需要保证整组章节的标题骨架、章节功能、摘要推进和结尾牵引同时通过。",
              "5. 若失败原因是标题重复或标题骨架集中，必须重写所有命中重复骨架的标题，而不是只局部修补几章。",
              "6. 若失败原因是章节功能重复，必须重新分配章节功能，避免连续多章只做调查、发现、意识到或铺垫。",
              "7. 每章 summary 必须体现新增推进，优先体现核心视角角色的选择、试探、反击、布局、交换、隐忍或承担代价。",
              "8. 明确避免大量使用“X的Y / X中的Y / 在X中Y”骨架。",
              "9. 明确避免整批标题继续塌成“A，B / 四字动作，四字结果”并列模板。",
              "10. 标题必须是客观章名，不用第一人称，不写成完整剧情句，核心字数不超过 16 个。",
              "11. 每章 beatKey 必须保持为当前目标 beatKey。",
              "12. 摘要必须体现本章造成的局面变化，不得空泛复述标题。",
              "13. 最后一章必须完成当前 beat 的 mustDeliver，同时留下阅读牵引，但不得提前兑现下一 beat 的核心事件。",
              "",
              "上一次的 JSON 输出：",
              safeJsonStringify(parsedOutput),
              "",
              "请重新输出完整 JSON 对象。",
            ].join("\n"),
          ),
        ];
      },
    },

    outputSchema: createVolumeChapterBeatBlockSchema({
      exactChapterCount: targetChapterCount,
      expectedBeatKey: targetBeatKey,
      expectedBeatLabel: targetBeatLabel,
    }),

    render: (promptInput, context) => [
      new SystemMessage(
        [
          "你是网文章节拆分规划助手。",
          "你的任务不是写正文，也不是扩写细纲，而是只为当前卷的单个节奏段生成一块可执行的章节列表。",
          "你必须同时满足：结构化输出正确、章节功能清晰、标题像章节名、摘要有真实推进。",
          "",
          "一、任务边界",
          `1. 你当前只能为「${targetBeatLabel}」生成 ${targetChapterCount} 章，数量不得多也不得少。`,
          "2. 只允许覆盖当前目标 beat，不得越界生成相邻 beat 的章节。",
          "3. 不得把两个章节合并成一章摘要，也不得用空泛占位章来凑数。",
          "4. 若 beat 信息不足，也必须补齐到精确章数，但只能做保守过渡，不得发明重大新设定。",
          "5. 本任务只生成章节列表，不写正文，不写详细场景，不写完整对白。",
          "",
          "二、硬性输出约束",
          "1. 顶层必须输出 beatKey、beatLabel、chapterCount、chapters 四个字段。",
          "2. 每章只能包含 title、summary、beatKey 三个字段，不得新增字段。",
          `3. beatKey 必须严格等于 ${targetBeatKey}。`,
          `4. beatLabel 必须严格等于 ${targetBeatLabel}。`,
          `5. chapterCount 与 chapters.length 必须严格等于 ${targetChapterCount}。`,
          `6. 每章 beatKey 都必须严格等于 ${targetBeatKey}。`,
          "7. 不得输出 Markdown、注释、解释或任何额外文本。",
          "",
          "三、章节规划核心原则",
          "1. 章节列表必须严格服从当前卷骨架与当前目标 beat 合同，不能偷跑到相邻 beat。",
          "2. 每章都必须回答：这一章为什么必须存在，它推进了什么，它造成了什么新的局面变化。",
          "3. 当前节奏段的章节拆分要体现网文阅读感，但不能机械平均切分。",
          "4. 章节必须形成连续递进，不能出现只是换说法、没有新增推进的信息重复章。",
          "5. 每章 summary 不只要写“发生了什么”，还要写“因此改变了什么”。",
          "",
          "四、章节功能分配要求",
          "1. 生成前必须在脑内把当前 beat 拆成若干章节功能：承接、加压、试探、发现、转折、反击、兑现、余波或钩子。",
          "2. 实际输出时不要暴露这些功能标签，但每章 summary 必须体现清晰功能。",
          "3. 连续章节不能承担完全相同的功能，尤其不能连续多章只做调查、讨论、铺垫、等待、意识到或发现。",
          "4. 若目标章数大于等于 5，至少应包含一次局面加压、一次关键发现或判断反转、一次阶段性兑现或明确转向。",
          "5. 关键推进可以占更多章节，过渡章要短促有力，不要为了凑数制造低信息密度章节。",
          "6. 最后一章必须完成当前 beat 的 mustDeliver，同时留下进入下一 beat 的阅读牵引，但不得提前兑现下一 beat 的核心事件。",
          "",
          "五、章节推进质量要求",
          "1. 每章 summary 都要体现核心视角角色的选择、试探、反击、隐忍、交换、布局、揭穿、妥协或承担代价，避免角色只是旁观外部事件。",
          "2. 每章 summary 应包含至少一种有效推进：新情报、风险升级、关系变化、资源得失、误判修正、对手后手、阶段兑现。",
          "3. 不要把章节写成“发现问题—意识到危险—继续调查”的重复链条。",
          "4. 可以制造或利用信息差、误判、反常发现、表面胜利下的暗中代价，但不要把完整因果句塞进标题。",
          "5. 每章结尾应隐含新的问题、威胁、机会、误判或选择压力，使下一章有继续阅读的理由。",
          "6. 当前 beat 内不能所有章节都只做铺垫；必须有实际推进、局面变化或阶段兑现。",
          "",
          "六、标题要求",
          "1. 每章 title 必须像真实章名，优先体现事件锚点、地点、冲突、异常发现、局面变化、阶段兑现、关系异动或问题钩子。",
          "2. 标题默认使用客观表达，不使用“我 / 我的 / 我却 / 我用 / 替我 / 追杀我”等第一人称自述。",
          "3. 在开始写 chapters 之前，先在脑内完成一次“标题句法配比规划”，再按配比输出，不要边想边重复套模板。",
          "4. 同一批标题必须主动混用动作推进型、冲突压迫型、异常发现型、结果兑现型、决断转向型、问题钩子型、关系异动型等不同句法。",
          "5. 标题核心字数不超过 16 个，推荐 4-12 个字；不要写成长句、完整因果句或剧情梗概。",
          "6. 标题可以有反差，但要短促，例如“密令失真”“断魂钉现”“阵眼裂缝”；不要写成“某人做了某事，所以某结果发生”。",
          "7. 避免只有抽象词：风暴、暗流、危机、真相、抉择、变局等，除非标题里同时有具体对象、动作或反差。",
          "8. 若当前节奏段有 6 章及以上：任何单一表层骨架都不要超过一半；不能大量重复“X的Y / X中的Y / 在X中Y”这类骨架，最多只占约三成。",
          "9. 明确避免让大部分标题继续塌成“A，B / 四字动作，四字结果”并列模板。",
          "10. 相邻章节标题不要连续 3 章以上套用同一语法骨架。",
          "11. 标题要有推进感与可读性，避免空泛文学化、抽象抒情化、口号化或模板味过重。",
          "12. 主角主动性、选择和代价主要写在 summary 中，不要为了体现主角行动把标题写成第一人称爽点句。",
          "13. 生成前先自检一遍：是否出现第一人称标题、标题过长、过多“的字结构”、过多逗号并列结构、或连续多章同骨架；若出现，先改再输出。",
          "",
          "七、摘要要求",
          "1. 每章 summary 必须写清本章具体推进了什么，以及它在当前目标 beat 中承担什么作用。",
          "2. summary 必须体现新增信息、局面变化、冲突推进、关系变化、代价上升、风险转向或阶段兑现中的至少一种。",
          "3. summary 必须体现本章造成的不可逆变化：人物判断改变、资源状态改变、敌我关系改变、风险等级改变、计划方向改变或读者认知改变。",
          "4. 不要把 summary 写成空泛口号，也不要写成详细剧情复述。",
          "5. 相邻章节 summary 不能只是同义重复。",
          "6. 不要大量使用“进一步推动剧情”“局势更加复杂”“为后续埋下伏笔”等低信息密度表达。",
          "",
          "八、beat 承接要求",
          "1. 本次只覆盖当前目标 beat，不得为相邻 beats 生成章节。",
          "2. 开头章节要承接前序已生成章节状态，不能把已经发生的推进重新起一遍。",
          "3. 中段章节要围绕当前 beat 的核心矛盾持续加压、试探、转折或兑现。",
          "4. 结尾章节要把当前 beat 的 mustDeliver 落到位，但不要提前偷跑下一 beat 的核心兑现。",
          "",
          "九、质量自检要求",
          "1. 输出前在脑内检查：章节数量是否精确、beatKey 是否一致、是否越界、是否有重复功能章。",
          "2. 输出前在脑内检查：标题是否过度同构，summary 是否有真实推进，结尾章是否有阶段兑现或阅读牵引。",
          "3. 若发现章节只是换说法、无新增推进、无主角行动、无局面变化，必须先改再输出。",
          "",
          buildRetryDirective(promptInput.retryReason),
        ]
          .filter(Boolean)
          .join("\n"),
      ),

      new HumanMessage(
        [
          "请基于以下上下文，输出当前节奏段的章节块。",
          "",
          "输出要求：",
          "- 只输出严格 JSON",
          `- beatKey 必须严格等于 ${targetBeatKey}`,
          `- beatLabel 必须严格等于 ${targetBeatLabel}`,
          `- chapterCount 与 chapters.length 必须严格等于 ${targetChapterCount}`,
          "- 每章只能包含 title、summary、beatKey",
          "- 不得生成任何相邻 beat 的章节",
          "- 先在脑内规划章节功能分配与标题骨架配比，再输出完整章节块",
          "- 优先保证章节推进感、节奏承接、标题结构分散、摘要中的角色主动性与结尾牵引",
          "- 标题必须短促客观，不使用第一人称，不写成长句或剧情梗概",
          "",
          "当前卷拆章上下文：",
          renderSelectedContextBlocks(context),
        ].join("\n"),
      ),
    ],

    postValidate: (output) => {
      if (output.beatKey !== targetBeatKey) {
        throw new Error(`beatKey 必须严格等于 ${targetBeatKey}。`);
      }

      if (output.beatLabel !== targetBeatLabel) {
        throw new Error(`beatLabel 必须严格等于 ${targetBeatLabel}。`);
      }

      if (
        output.chapterCount !== targetChapterCount ||
        output.chapters.length !== targetChapterCount
      ) {
        throw new Error(
          `chapterCount 与 chapters.length 必须严格等于 ${targetChapterCount}。`,
        );
      }

      output.chapters.forEach((chapter, index) => {
        if (chapter.beatKey !== targetBeatKey) {
          throw new Error(
            `第 ${index + 1} 条章节的 beatKey 必须严格等于 ${targetBeatKey}。`,
          );
        }
      });

      const titleDiversityIssue = getChapterTitleDiversityIssue(
        output.chapters.map((chapter) => chapter.title),
      );

      if (titleDiversityIssue) {
        throw new Error(titleDiversityIssue);
      }

      const chapterFunctionQualityIssue = getChapterFunctionQualityIssue(
        output.chapters,
      );

      if (chapterFunctionQualityIssue) {
        throw new Error(chapterFunctionQualityIssue);
      }

      return output;
    },

    postValidateFailureRecovery: ({ rawOutput, validationError }) => {
      if (isBlockingChapterTitleQualityIssue(validationError)) {
        throw new Error(validationError);
      }

      if (isChapterTitleDiversityIssue(validationError) || isChapterFunctionQualityIssue(validationError)) {
        return rawOutput;
      }

      throw new Error(validationError);
    },
  };
}

export { buildVolumeChapterListContextBlocks };
