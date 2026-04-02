import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../../core/renderContextBlocks";
import { createVolumeBeatSheetSchema } from "../../../../services/novel/volume/volumeGenerationSchemas";
import { type VolumeBeatSheetPromptInput } from "./shared";
import { buildVolumeBeatSheetContextBlocks } from "./contextBlocks";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";

export const volumeBeatSheetPrompt: PromptAsset<
  VolumeBeatSheetPromptInput,
  ReturnType<typeof createVolumeBeatSheetSchema>["_output"]
> = {
  id: "novel.volume.beat_sheet",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.volumeBeatSheet,
    requiredGroups: ["book_contract", "target_volume"],
    preferredGroups: ["macro_constraints", "strategy_context", "volume_window"],
    dropOrder: ["soft_future_summary"],
  },
  repairPolicy: {
    maxAttempts: 2,
  },
  outputSchema: createVolumeBeatSheetSchema(),
  render: (_input, context) => [
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
      '      "summary": "这一拍主要推进什么，它在本卷节奏中的职责是什么，以及它如何承接卷骨架中的对应承诺。",',
      '      "chapterSpanHint": "1-2章",',
      '      "mustDeliver": ["读者必须感知到的关键信号1", "必须建立的局面或冲突2"]',
      "    }",
      "  ]",
      "}",
      "",
      "【硬性要求】",
      "1. beats 必须输出 5-8 条。",
      "2. 每个 beat 都必须完整包含 key、label、summary、chapterSpanHint、mustDeliver 五个字段，不能缺漏、不能改名。",
      "3. summary 必须写清：这一拍推进了什么、承担什么节奏职责、与卷骨架中的哪类承诺或压力相关。",
      "4. chapterSpanHint 必须是非空字符串，使用类似“1-2章”“3章”“7-8章”的表达。",
      "5. mustDeliver 必须是 1-6 条非空字符串，优先写必须兑现的局面、信号、压力、转向、读者感知，不要只写抽象口号。",
      "6. beats 必须至少覆盖：开卷抓手、第一次升级或反制、中段转向、高潮前挤压、卷高潮、卷尾钩子。",
      "7. 各 beat 的节奏职责必须有差异，不能把多个 beat 都写成‘冲突升级’或‘继续推进’。",
      "8. 不要把高潮前挤压写成提前高潮，也不要把卷尾钩子写成泛泛留白。",
      "",
      "【卷骨架承接要求】",
      "1. 开头相关 beat 必须承接 target_volume 中的 openingHook 与 mainPromise。",
      "2. 前中段 beats 必须逐步体现 primaryPressureSource 与 escalationMode。",
      "3. 中段必须体现 midVolumeRisk 或等价的局面转向，不能只是线性加码。",
      "4. climax beat 必须承接卷高潮承诺，形成明确兑现。",
      "5. 结尾 beat 必须承接 nextVolumeHook，并通过 resetPoint 或残局重组形成下一卷入口。",
      "",
      "【质量要求】",
      "1. 每个 beat 都要回答：这一段章节为什么必须存在。",
      "2. 相邻 beat 要形成递进或转向关系，而不是同义重复。",
      "3. 节奏上要体现前段立钩子与承诺，中段换挡与抬代价，后段挤压与兑现，结尾留入口。",
      "4. 信息不足时也必须给出完整字段，但应保守，不要发明脱离上下文的大设定。",
      "",
      "【建议 key】",
      "建议优先使用稳定英文标识，例如：open_hook / first_escalation / midpoint_turn / pressure_lock / climax / end_hook。",
    ].join("\n")),
    new HumanMessage([
      "请基于以下上下文，为当前目标卷生成单卷 beat sheet。",
      "",
      "【输出要求】",
      "- 只输出 JSON",
      "- 不补充 schema 之外字段",
      "- beats 是节奏任务分段，不是章节目录",
      "- 优先保证与卷骨架承接关系清晰、节奏职责明确、后续可拆章",
      "",
      "【当前卷节奏板上下文】",
      renderSelectedContextBlocks(context),
    ].join("\n")),
  ],
};

export { buildVolumeBeatSheetContextBlocks };
