import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../../core/renderContextBlocks";
import { createVolumeChapterBeatBlockSchema } from "../../../../services/novel/volume/volumeGenerationSchemas";
import { type VolumeChapterListPromptInput } from "./shared";
import { buildVolumeChapterListContextBlocks } from "./contextBlocks";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";

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
  ].join("\n");
}

function resolvePromptConfig(
  input: number | {
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

export function createVolumeChapterListPrompt(
  input: number | {
    targetChapterCount: number;
    targetBeatKey?: string;
    targetBeatLabel?: string | null;
  },
): PromptAsset<
  VolumeChapterListPromptInput,
  ReturnType<typeof createVolumeChapterBeatBlockSchema>["_output"]
> {
  const {
    targetChapterCount,
    targetBeatKey,
    targetBeatLabel,
  } = resolvePromptConfig(input);

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
      buildMessages: ({ attempt, baseMessages, parsedOutput, validationError }) => [
        ...baseMessages,
        new HumanMessage([
          `上一次章节块通过了 JSON 结构校验，但没有通过业务校验。这是第 ${attempt} 次语义重试。`,
          `失败原因：${validationError}`,
          "",
          "重写要求：",
          "1. 只重写当前节奏段的标题结构和必要摘要，不得越界生成其他节奏段章节。",
          "2. 必须保留原有章节位数，最终 chapters.length 仍然必须等于目标章数。",
          "3. 必须重写所有命中重复骨架的标题，而不是只局部修补几章。",
          "4. 明确避免大量使用“X的Y / X中的Y / 在X中Y”骨架。",
          "5. 明确避免整批标题继续塌成“A，B / 四字动作，四字结果”并列模板。",
          "6. 每章 beatKey 必须保持为当前目标 beatKey。",
          "7. 摘要必须体现本章新增推进，不能空泛复述标题。",
          "",
          "上一次的 JSON 输出：",
          safeJsonStringify(parsedOutput),
          "",
          "请重新输出完整 JSON 对象。",
        ].join("\n")),
      ],
    },
    outputSchema: createVolumeChapterBeatBlockSchema({
      exactChapterCount: targetChapterCount,
      expectedBeatKey: targetBeatKey,
      expectedBeatLabel: targetBeatLabel,
    }),
    render: (promptInput, context) => [
      new SystemMessage([
        "你是网文章节拆分规划助手。",
        "你的任务不是写正文，也不是扩写细纲，而是只为当前卷的单个节奏段生成一块可执行的章节列表。",
        "",
        "任务边界：",
        `1. 你当前只能为「${targetBeatLabel}」生成 ${targetChapterCount} 章，数量不得多也不得少。`,
        "2. 只允许覆盖当前目标 beat，不得越界生成相邻 beat 的章节。",
        "3. 不得把两个章节合并成一章摘要，也不得用空泛占位章来凑数。",
        "4. 若 beat 信息不足，也必须补齐到精确章数，但只能做保守过渡，不得发明重大新设定。",
        "5. 顶层必须输出 beatKey、beatLabel、chapterCount、chapters 四个字段。",
        "6. 每章只能包含 title、summary、beatKey 三个字段，不得新增字段。",
        "7. 不得输出 Markdown、注释、解释或任何额外文本。",
        "",
        "硬性输出约束：",
        `1. beatKey 必须严格等于 ${targetBeatKey}。`,
        `2. beatLabel 必须严格等于 ${targetBeatLabel}。`,
        `3. chapterCount 与 chapters.length 必须严格等于 ${targetChapterCount}。`,
        `4. 每章 beatKey 都必须严格等于 ${targetBeatKey}。`,
        "",
        "核心原则：",
        "1. 章节列表必须严格服从当前卷骨架与当前目标 beat 合同，不能偷跑到相邻 beat。",
        "2. 每章都必须回答：这一章为什么必须存在，它推进了什么，它在当前节奏段中承担什么作用。",
        "3. 当前节奏段的章节拆分要体现网文阅读感，但不能机械平均切分。",
        "4. 章节必须形成连续递进，不能出现只是换说法、没有新增推进的信息重复章。",
        "",
        "标题要求：",
        "1. 每章 title 必须像真实网文章名，优先体现推进动作、冲突压迫、异常发现、局面变化、阶段兑现或关系异动。",
        "2. 在开始写 chapters 之前，先在脑内完成一次“标题句法配比规划”，再按配比输出，不要边想边重复套模板。",
        "3. 同一批标题必须主动混用动作推进型、冲突压迫型、异常发现型、结果兑现型、决断转向型、问题钩子型等不同句法。",
        "4. 若当前节奏段有 6 章及以上：任何单一表层骨架都不要超过一半；“X的Y / X中的Y / 在X中Y”这类骨架最多只占约三成。",
        "5. 明确避免让大部分标题继续塌成“A，B / 四字动作，四字结果”并列模板。",
        "6. 相邻章节标题不要连续 3 章以上套用同一语法骨架。",
        "7. 标题要有推进感与可读性，避免空泛文学化、抽象抒情化或模板味过重。",
        "8. 生成前先自检一遍：是否出现过多“的字结构”、过多逗号并列结构、或连续多章同骨架；若出现，先改再输出。",
        "",
        "摘要要求：",
        "1. 每章 summary 必须写清本章具体推进了什么，以及它在当前目标 beat 中承担什么作用。",
        "2. summary 必须体现新增信息、局面变化、冲突推进、关系变化、代价上升、风险转向或阶段兑现中的至少一种。",
        "3. 不要把 summary 写成空泛口号，也不要写成详细剧情复述。",
        "4. 相邻章节 summary 不能只是同义重复。",
        "",
        "beat 承接要求：",
        "1. 本次只覆盖当前目标 beat，不得为相邻 beats 生成章节。",
        "2. 开头章节要承接前序已生成章节状态，不能把已经发生的推进重新起一遍。",
        "3. 结尾章节要把当前 beat 的 mustDeliver 落到位，但不要提前偷跑下一 beat 的核心兑现。",
        "",
        "质量要求：",
        "1. 不要平均分配信息量，关键推进可以占更多章节，过渡章要短促有力。",
        "2. 不要连续出现多个功能完全相同的章节。",
        "3. 不要为了凑章节数制造低信息密度章节。",
        "4. 在信息不足时也要给出完整章节块，但必须保守，不得空泛。",
        "",
        buildRetryDirective(promptInput.retryReason),
      ].filter(Boolean).join("\n")),
      new HumanMessage([
        "请基于以下上下文，输出当前节奏段的章节块。",
        "",
        "输出要求：",
        "- 只输出严格 JSON",
        `- beatKey 必须严格等于 ${targetBeatKey}`,
        `- beatLabel 必须严格等于 ${targetBeatLabel}`,
        `- chapterCount 与 chapters.length 必须严格等于 ${targetChapterCount}`,
        "- 每章只能包含 title、summary、beatKey",
        "- 不得生成任何相邻 beat 的章节",
        "- 先在脑内规划标题骨架配比，再输出完整章节块",
        "- 优先保证章节推进感、节奏承接与标题结构分散",
        "",
        "当前卷拆章上下文：",
        renderSelectedContextBlocks(context),
      ].join("\n")),
    ],
    postValidate: (output) => {
      if (output.beatKey !== targetBeatKey) {
        throw new Error(`beatKey 必须严格等于 ${targetBeatKey}。`);
      }
      if (output.beatLabel !== targetBeatLabel) {
        throw new Error(`beatLabel 必须严格等于 ${targetBeatLabel}。`);
      }
      if (output.chapterCount !== targetChapterCount || output.chapters.length !== targetChapterCount) {
        throw new Error(`chapterCount 与 chapters.length 必须严格等于 ${targetChapterCount}。`);
      }
      output.chapters.forEach((chapter, index) => {
        if (chapter.beatKey !== targetBeatKey) {
          throw new Error(`第 ${index + 1} 条章节的 beatKey 必须严格等于 ${targetBeatKey}。`);
        }
      });
      return output;
    },
  };
}

export { buildVolumeChapterListContextBlocks };
