import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../../core/renderContextBlocks";
import { createVolumeBeatSheetSchema } from "../../../../services/novel/volume/volumeGenerationSchemas";
import { validateBeatSheetChapterCoverage } from "../../../../services/novel/volume/volumeBeatSheetChapterBudget";
import {
  VOLUME_BEAT_OPTIONAL_SLOT_KEYS,
  VOLUME_BEAT_REQUIRED_SLOT_KEYS,
  VOLUME_BEAT_SLOT_DEFINITIONS,
  getVolumeBeatRoleLabel,
} from "@ai-novel/shared/types/volumeBeatSlots";
import { type VolumeBeatSheetPromptInput } from "./shared";
import { buildVolumeBeatSheetContextBlocks } from "./contextBlocks";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";

const REQUIRED_SLOT_LINES = VOLUME_BEAT_REQUIRED_SLOT_KEYS
  .map((key) => `- ${key}（${getVolumeBeatRoleLabel(key)}）`)
  .join("\n");

const OPTIONAL_SLOT_LINES = VOLUME_BEAT_OPTIONAL_SLOT_KEYS
  .map((key) => `- ${key}（${getVolumeBeatRoleLabel(key)}）`)
  .join("\n");

const SLOT_ORDER_LINE = VOLUME_BEAT_SLOT_DEFINITIONS
  .map((slot) => slot.key)
  .join(" -> ");

export const volumeBeatSheetPrompt: PromptAsset<
  VolumeBeatSheetPromptInput,
  ReturnType<typeof createVolumeBeatSheetSchema>["_output"]
> = {
  id: "novel.volume.beat_sheet",
  version: "v2",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.volumeBeatSheet,
    requiredGroups: ["book_contract", "target_volume", "target_chapter_count"],
    preferredGroups: ["macro_constraints", "strategy_context", "volume_window"],
    dropOrder: ["soft_future_summary"],
  },
  repairPolicy: {
    maxAttempts: 2,
  },
  semanticRetryPolicy: {
    maxAttempts: 1,
  },
  outputSchema: createVolumeBeatSheetSchema(),
  render: (input, context) => [
    new SystemMessage([
      "你是网文单卷节奏规划助手。",
      "你的任务不是写章节目录，也不是扩写剧情梗概，而是把“卷骨架”转成可供后续拆章使用的 beat sheet。",
      "beat 是卷内一个阶段性的节奏任务单元，代表一段章节范围内最主要的推进职责、阅读功能与必须兑现的内容。",
      "",
      "【任务边界】",
      "当前阶段只生成单卷 beat sheet，不展开具体章节，不写场景细纲，不补人物小传，不写对白。",
      "每个 beat 必须服务于后续拆章，强调‘这段章节要完成什么节奏任务’，而不是罗列细碎事件。",
      "只输出严格 JSON，不要输出 Markdown、解释、注释或额外字段。",
      "",
      "【输出格式】",
      "{",
      '  "beats": [',
      "    {",
      '      "key": "open_hook",',
      '      "label": "开卷抓手",',
      '      "title": "夜市夺印",',
      '      "summary": "这一拍主要推进什么，它在本卷节奏中的职责是什么，以及它如何承接卷骨架中的对应承诺。",',
      '      "chapterSpanHint": "1-2章",',
      '      "mustDeliver": ["读者必须感知到的关键信号1", "必须建立的局面或冲突2"]',
      "    }",
      "  ]",
      "}",
      "",
      "【固定职能槽位】",
      "节奏职能 key 与 label 必须使用系统固定槽位，不能自由发明职能名。",
      "必需槽位（必须全部出现，且只能各出现一次）：",
      REQUIRED_SLOT_LINES,
      "可选槽位（最多使用 2 个，用于本卷确实需要的额外阶段）：",
      OPTIONAL_SLOT_LINES,
      `推荐顺序：${SLOT_ORDER_LINE}`,
      "",
      "【硬性要求】",
      "1. beats 必须输出 6-8 条，且必须覆盖全部 6 个必需槽位。",
      "2. 每个 beat 都必须完整包含 key、label、title、summary、chapterSpanHint、mustDeliver 六个字段。",
      "3. key 只能使用上面列出的固定槽位；label 必须等于该槽位的稳定职能名，例如 open_hook 对应「开卷抓手」。",
      "4. title 必须是本卷定制短标题，8 字以内，体现本卷具体卖点或局面，不能只重复 label。",
      "5. summary 必须写清：这一拍推进了什么、承担什么节奏职责、与卷骨架中的哪类承诺或压力相关。",
      "6. chapterSpanHint 必须是非空字符串，使用类似“1-2章”“3章”“7-8章”的表达。",
      "7. mustDeliver 必须是 1-6 条非空字符串，优先写必须兑现的局面、信号、压力、转向、读者感知，不要只写抽象口号。",
      "8. 各 beat 的节奏职责必须有差异，不能把多个 beat 都写成‘冲突升级’或‘继续推进’。",
      "9. 不要把高潮前挤压写成提前高潮，也不要把卷尾钩子写成泛泛留白。",
      `10. 所有 chapterSpanHint 必须从第 1 章连续覆盖到第 ${input.targetChapterCount} 章附近，不能只覆盖少量开头章节。`,
      "",
      "【卷骨架承接要求】",
      "1. open_hook 必须承接 target_volume 中的 openingHook 与 mainPromise。",
      "2. first_escalation 与中前段 beats 必须逐步体现 primaryPressureSource 与 escalationMode。",
      "3. midpoint_turn 必须体现 midVolumeRisk 或等价的局面转向，不能只是线性加码。",
      "4. climax 必须承接卷高潮承诺，形成明确兑现。",
      "5. end_hook 必须承接 nextVolumeHook，并通过 resetPoint 或残局重组形成下一卷入口。",
      "",
      "【质量要求】",
      "1. 每个 beat 都要回答：这一段章节为什么必须存在。",
      "2. 相邻 beat 要形成递进或转向关系，而不是同义重复。",
      "3. 节奏上要体现前段立钩子与承诺，中段换挡与抬代价，后段挤压与兑现，结尾留入口。",
      "4. title 要具体到本卷，例如“夜市夺印”“宗门试炼开局”，不要输出“开卷抓手”“第一次升级”这类职能复读。",
      "5. 信息不足时也必须给出完整字段，但应保守，不要发明脱离上下文的大设定。",
      "",
      `Current volume target chapter count: ${input.targetChapterCount}.`,
      `chapterSpanHint must use volume-local numbering only, start from 1 inside the current volume, and never exceed ${input.targetChapterCount}. Never use whole-book absolute chapter numbers.`,
    ].join("\n")),
    new HumanMessage([
      "请基于以下上下文，为当前目标卷生成单卷 beat sheet。",
      "",
      "【输出要求】",
      "- 只输出 JSON",
      "- 不补充 schema 之外字段",
      "- key/label 使用固定职能槽位，title 写本卷定制短标题",
      "- beats 是节奏任务分段，不是章节目录",
      "- 优先保证与卷骨架承接关系清晰、节奏职责明确、后续可拆章",
      "",
      "【当前卷节奏板上下文】",
      `- Current volume target chapter count: ${input.targetChapterCount}`,
      "- chapterSpanHint must stay within this volume only; do not use whole-book absolute chapter numbers",
      `- all beat spans together must cover chapters 1-${input.targetChapterCount} of this volume`,
      "",
      renderSelectedContextBlocks(context),
    ].join("\n")),
  ],
  postValidate: (output, input) => {
    const coverage = validateBeatSheetChapterCoverage({
      beatSheet: output,
      targetChapterCount: input.targetChapterCount,
    });
    if (!coverage.accepted) {
      throw new Error(coverage.message ?? "当前卷节奏板章节跨度没有覆盖目标章数。");
    }
    return output;
  },
};

export { buildVolumeBeatSheetContextBlocks };
