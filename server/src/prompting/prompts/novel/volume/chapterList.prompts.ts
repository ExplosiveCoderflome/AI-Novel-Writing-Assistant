import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../../core/renderContextBlocks";
import { createVolumeChapterListSchema } from "../../../../services/novel/volume/volumeGenerationSchemas";
import { assertChapterTitleDiversity } from "../../../../services/novel/volume/chapterTitleDiversity";
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
    version: "v4",
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
          "1. 保持章节总数不变，保持 beat 推进顺序不变。",
          "2. 优先重写标题结构分布，避免大量回落到“X的Y / X中的Y / 在X中Y”这类名词性骨架。",
          "3. 同时避免整批标题继续塌成“A，B / 四字动作，四字结果”这一类并列式模板。",
          "4. 相邻章节标题不要连续复用同一种句法骨架或语气。",
          "5. 摘要不要空泛重复，必须体现本章新增推进与卷内节奏职责。",
          "6. 不要把章节写成只有气氛没有事件推进的占位章。",
          "",
          "上一次的 JSON 输出：",
          safeJsonStringify(parsedOutput),
          "",
          "请重新输出完整 JSON 对象。",
        ].join("\n")),
      ],
    },
    outputSchema: createVolumeChapterListSchema(targetChapterCount),
    render: (input, context) => [
      new SystemMessage([
        "你是网文章节拆分规划助手。",
        "你的任务不是写正文，也不是扩写详细细纲，而是把当前卷与当前卷 beat sheet 拆成可执行的章节列表。",
        "",
        "【任务边界】",
        `必须严格输出 ${targetChapterCount} 章，数量不得多也不得少。`,
        "每章只能包含 title 和 summary 两个字段，不得新增字段，不得输出 Markdown、注释、解释或额外文本。",
        "当前阶段只做章节级拆分，不写场景细纲、对白、人物小传、章内分幕。",
        "",
        "【核心原则】",
        "1. 章节列表必须严格服从当前卷骨架与 beat sheet，章节顺序不得破坏 beat 的推进顺序。",
        "2. 每章都必须回答：这一章为什么必须存在，它推进了什么，它在当前卷节奏中承担什么作用。",
        "3. 章节拆分要体现网文阅读感，避免机械平均切分，允许不同 beat 下章节密度不同。",
        "4. 章节必须形成连续递进，不能出现只换说法、不增推进的信息重复章。",
        "",
        "【标题要求】",
        "1. 每章 title 必须像真实网文章名，优先体现推进动作、冲突压迫、异常发现、局面变化、阶段兑现或关系异动。",
        "2. 同一批章节标题必须做表层结构分散，不能大面积重复“X的Y / X中的Y / 在X中Y”这一类名词性结构。",
        "3. 也不能让大部分标题都变成“A，B / 四字动作，四字结果”这种并列模板。",
        "4. 相邻章节标题不能连续套用同一骨架，优先混用动作推进型、冲突压迫型、发现异常型、结果兑现型、决断转向型标题。",
        "5. 只有在极少数确有必要时，才允许使用“X的Y / X中的Y”结构或统一并列式结构。",
        "6. 标题要有推进感与可读性，避免空泛文学化、抽象抒情化或模板味过重。",
        "",
        "【摘要要求】",
        "1. 每章 summary 必须写清本章具体推进了什么，以及它在当前卷节奏中的作用。",
        "2. summary 必须体现新增信息、局面变化、冲突推进、关系变化、代价上升、风险转向或阶段兑现中的至少一种，不能写成空泛口号。",
        "3. summary 必须服务于拆章，不要写成过粗的章节标题解释，也不要写成详细剧情复述。",
        "4. 相邻章节 summary 不能只是同义重复，必须体现明确的推进差异。",
        "",
        "【beat 承接要求】",
        "1. 章节列表整体必须完整覆盖 target_beat_sheet 的 beats，且推进顺序保持一致。",
        "2. 开头章节必须承接本卷的 openingHook 与前段 beats，快速建立本卷主要困境、钩子和阅读承诺。",
        "3. 中段章节必须承接升级、反制或转向类 beats，体现局面变化，而不是线性重复加码。",
        "4. 高潮前章节必须完成挤压、锁死、代价抬高或方案失效，不得提前把高潮写完。",
        "5. 高潮章节必须形成明确兑现。",
        "6. 结尾章节必须承接卷尾钩子，并形成下一阶段入口，不能只是收尾性总结。",
        "",
        "【拆章质量要求】",
        "1. 不要平均分配信息量，关键 beat 可以占更多章节，过渡 beat 应尽量短促有力。",
        "2. 不要连续出现多个功能完全相同的章节，例如连续铺压、连续解释、连续反应、连续等待。",
        "3. 不要为了凑章节数制造低信息密度章节。",
        "4. 不要脱离上下文擅自发明重大设定或重大人物变化。",
        "5. 在信息不足时也要给出完整章节列表，但应保守，不要空泛。",
        "",
        buildRetryDirective(input.retryReason),
      ].join("\n")),
      new HumanMessage([
        "请基于以下上下文，输出当前卷的章节列表。",
        "",
        "【输出要求】",
        "- 只输出严格 JSON",
        `- 必须严格输出 ${targetChapterCount} 章`,
        "- 每章只能包含 title 和 summary",
        "- 保持 beat 顺序不变",
        "- 优先保证章节推进感、节奏承接关系与标题结构分散度",
        "",
        "【当前卷拆章上下文】",
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
