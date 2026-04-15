import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../../core/renderContextBlocks";
import { createVolumeChapterListSchema } from "../../../../services/novel/volume/volumeGenerationSchemas";
import {
  assertChapterTitleDiversity,
  isChapterTitleDiversityIssue,
} from "../../../../services/novel/volume/chapterTitleDiversity";
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

export function createVolumeChapterListPrompt(
  targetChapterCount: number,
): PromptAsset<
  VolumeChapterListPromptInput,
  ReturnType<typeof createVolumeChapterListSchema>["_output"]
> {
  return {
    id: "novel.volume.chapter_list",
    version: "v5",
    taskType: "planner",
    mode: "structured",
    language: "zh",
    contextPolicy: {
      maxTokensBudget: NOVEL_PROMPT_BUDGETS.volumeChapterList,
      requiredGroups: ["book_contract", "target_volume", "target_beat_sheet", "target_chapter_count"],
      preferredGroups: ["macro_constraints", "adjacent_volumes", "soft_future_summary"],
      dropOrder: ["soft_future_summary"],
    },
    semanticRetryPolicy: {
      maxAttempts: 2,
      buildMessages: ({ attempt, baseMessages, parsedOutput, validationError }) => [
        ...baseMessages,
        new HumanMessage([
          `上一次章节列表通过了 JSON 结构校验，但没有通过业务校验。这是第 ${attempt} 次语义重试。`,
          `失败原因：${validationError}`,
          "",
          "重写要求：",
          "1. 只重写标题结构和必要摘要，不改 beat 顺序，不改章节总数。",
          "2. 必须保留原有章节位数，最终 chapters.length 仍然必须等于目标章数。",
          "3. 必须重写所有命中重复骨架的标题，而不是只局部修补几章。",
          "4. 明确避免大量使用“X的Y / X中的Y / 在X中Y”骨架。",
          "5. 明确避免整批标题继续塌成“A，B / 四字动作，四字结果”并列模板。",
          "6. 摘要必须体现本章新增推进，不能空泛复述标题。",
          "",
          "上一次的 JSON 输出：",
          safeJsonStringify(parsedOutput),
          "",
          "请重新输出完整 JSON 对象。",
        ].join("\n")),
      ],
    },
    outputSchema: createVolumeChapterListSchema(targetChapterCount),
    postValidateFailureRecovery: ({ rawOutput, validationError }) => {
      if (isChapterTitleDiversityIssue(validationError)) {
        return rawOutput;
      }
      throw new Error(validationError);
    },
    render: (input, context) => [
      new SystemMessage([
        "你是网文章节拆分规划助手。",
        "你的任务不是写正文，也不是扩写细纲，而是把当前卷与当前卷 beat sheet 拆成可执行的章节列表。",
        "",
        "任务边界：",
        `1. 最终必须严格输出 ${targetChapterCount} 章，数量不得多也不得少。`,
        `2. 在输出前，先在内部规划满 ${targetChapterCount} 个章节位，再一次性输出完整列表。`,
        "3. 不得把两个章节合并成一章摘要，也不得用空泛占位章来凑数。",
        "4. 若 beat 信息不足，也必须补齐到精确章数，但只能做保守过渡，不得发明重大新设定。",
        "5. 每章只能包含 title 和 summary 两个字段，不得新增字段。",
        "6. 不得输出 Markdown、注释、解释或任何额外文本。",
        "",
        "硬性输出约束：",
        `1. chapters.length 必须等于 ${targetChapterCount}。`,
        `2. 少于 ${targetChapterCount} 不合格，多于 ${targetChapterCount} 也不合格。`,
        "3. beat 推进顺序必须保持不变。",
        "",
        "核心原则：",
        "1. 章节列表必须严格服从当前卷骨架与 beat sheet，不能打乱 beat 的推进顺序。",
        "2. 每章都必须回答：这一章为什么必须存在，它推进了什么，它在当前卷节奏中承担什么作用。",
        "3. 章节拆分要体现网文阅读感，允许不同 beat 拥有不同密度，但不能机械平均切分。",
        "4. 章节必须形成连续递进，不能出现只是换说法、没有新增推进的信息重复章。",
        "",
        "标题要求：",
        "1. 每章 title 必须像真实网文章名，优先体现推进动作、冲突压迫、异常发现、局面变化、阶段兑现或关系异动。",
        "2. 必须做表层结构分散，不能大量重复“X的Y / X中的Y / 在X中Y”。",
        "3. 也不能让大部分标题都塌成“A，B / 四字动作，四字结果”并列模板。",
        "4. 相邻章节标题不能连续套用同一语法骨架。",
        "5. 标题要有推进感与可读性，避免空泛文学化、抽象抒情化或模板味过重。",
        "",
        "摘要要求：",
        "1. 每章 summary 必须写清本章具体推进了什么，以及它在当前卷节奏中的作用。",
        "2. summary 必须体现新增信息、局面变化、冲突推进、关系变化、代价上升、风险转向或阶段兑现中的至少一种。",
        "3. 不要把 summary 写成空泛口号，也不要写成详细剧情复述。",
        "4. 相邻章节 summary 不能只是同义重复。",
        "",
        "beat 承接要求：",
        "1. 章节列表整体必须完整覆盖 target_beat_sheet 的 beats。",
        "2. 开头章节要承接 openingHook 与前段 beats，快速建立本卷困境与阅读承诺。",
        "3. 中段章节必须承接升级、反制或转向类 beats，体现局面变化。",
        "4. 高潮前章节必须完成挤压、锁死、代价抬高或方案失效。",
        "5. 高潮章节必须形成明确兑现。",
        "6. 结尾章节必须承接卷尾钩子并形成下一阶段入口。",
        "",
        "质量要求：",
        "1. 不要平均分配信息量，关键 beat 可以占更多章节，过渡 beat 要短促有力。",
        "2. 不要连续出现多个功能完全相同的章节。",
        "3. 不要为了凑章节数制造低信息密度章节。",
        "4. 在信息不足时也要给出完整章节列表，但必须保守，不得空泛。",
        "",
        buildRetryDirective(input.retryReason),
      ].filter(Boolean).join("\n")),
      new HumanMessage([
        "请基于以下上下文，输出当前卷的章节列表。",
        "",
        "输出要求：",
        "- 只输出严格 JSON",
        `- 必须严格输出 ${targetChapterCount} 章`,
        `- 最终 chapters.length 必须等于 ${targetChapterCount}`,
        "- 每章只能包含 title 和 summary",
        "- 保持 beat 顺序不变",
        "- 优先保证章节推进感、节奏承接与标题结构分散",
        "",
        "当前卷拆章上下文：",
        renderSelectedContextBlocks(context),
      ].join("\n")),
    ],
    postValidate: (output) => {
      assertChapterTitleDiversity(output.chapters.map((chapter) => chapter.title));
      return output;
    },
  };
}

export { buildVolumeChapterListContextBlocks };
