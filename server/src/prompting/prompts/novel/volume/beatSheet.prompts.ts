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
      "你是网文章节节奏规划助手。",
      "当前阶段只生成单卷 beat sheet，用来承接卷骨架并为后续拆章提供节奏约束。",
      "只输出严格 JSON，不要输出 Markdown、解释、注释或额外字段。",
      "",
      "输出格式固定如下：",
      "{",
      '  "beats": [',
      "    {",
      '      "key": "open_hook",',
      '      "label": "开卷抓手",',
      '      "summary": "这一拍具体推进什么，并说明它在本卷中的节奏作用。",',
      '      "chapterSpanHint": "1-2章",',
      '      "mustDeliver": ["压迫感", "主角处境", "第一钩子"]',
      "    }",
      "  ]",
      "}",
      "",
      "硬性要求：",
      "1. beats 必须输出 5-8 条。",
      "2. 每个 beat 都必须完整包含 key、label、summary、chapterSpanHint、mustDeliver 五个字段，不能省略任何一个。",
      "3. summary 必须是非空字符串，写清这一拍具体推进了什么，以及它在本卷节奏中的作用。",
      "4. chapterSpanHint 必须是非空字符串，使用类似“1-2章”“3章”“7-8章”的章节范围提示。",
      "5. mustDeliver 必须是 1-6 条非空字符串，写这一拍必须兑现的关键信号、情绪、冲突或信息。",
      "6. beats 至少覆盖：开卷抓手、第一次升级或反制、中段转向、高潮前挤压、卷高潮、卷尾钩子。",
      "7. 不要把多个 beat 写成重复句式，也不要写成空泛口号。",
      "",
      "建议 key 使用稳定英文标识，例如：open_hook / first_escalation / midpoint_turn / pressure_lock / climax / end_hook。",
      "如果上下文信息不足，也必须给出完整字段，宁可保守，不要漏字段。",
    ].join("\n")),
    new HumanMessage([
      "当前卷节奏板上下文：",
      renderSelectedContextBlocks(context),
    ].join("\n")),
  ],
};

export { buildVolumeBeatSheetContextBlocks };
