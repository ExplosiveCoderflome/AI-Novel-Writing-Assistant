import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../core/promptTypes";

export interface NovelDraftOptimizeSelectionPromptInput {
  target: "outline" | "structured_outline";
  instruction: string;
  charactersText: string;
  worldContext: string;
  before: string;
  after: string;
  selectedText: string;
}

export interface NovelDraftOptimizeFullPromptInput {
  target: "outline" | "structured_outline";
  instruction: string;
  charactersText: string;
  worldContext: string;
  currentDraft: string;
}

export const novelDraftOptimizeSelectionPrompt: PromptAsset<NovelDraftOptimizeSelectionPromptInput, string, string> = {
  id: "novel.draft_optimize.selection",
  version: "v1",
  taskType: "repair",
  mode: "text",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  render: (input) => [
    new SystemMessage(
      input.target === "structured_outline"
        ? [
            "你是严谨的 JSON 局部编辑器。",
            "你的任务是对“指定片段”进行最小侵入式改写，使其满足用户指令，同时保持整体结构稳定。",
            "",
            "只输出可直接替换原片段的文本，不要输出 Markdown、解释、注释或代码块。",
            "",
            "硬规则：",
            "1. 必须保持原有 JSON 语义、字段含义和层级结构。",
            "2. 不得新增字段、删除字段或改变键名。",
            "3. 不得扩展到片段之外，不得补写相邻结构。",
            "4. 改写应尽量“局部替换”，避免无关字段改动。",
            "5. 若为数组项，只改写该项内容，不影响数组结构。",
            "",
            "优先级规则：",
            "用户修正指令 > 原片段语义一致性 > 其他优化",
            "",
            "质量要求：",
            "1. 改写后必须语义自洽、结构合法、可直接落库使用。",
            "2. 不要做风格润色以外的无关改动。",
          ].join("\n")
        : [
            "你是小说编辑，执行“局部改写”任务。",
            "你的目标是在不破坏上下文的前提下，让目标片段更符合用户指令。",
            "",
            "只输出改写后的片段，不要输出解释、标题、前后文或额外文本。",
            "",
            "硬规则：",
            "1. 只允许改写“待改写片段”，不得扩写到其他段落。",
            "2. 必须保持原片段的核心主题、角色、事件关系与因果逻辑不变。",
            "3. 不得引入新角色、新设定或未出现的关键信息。",
            "4. 若原片段为列表项，必须返回“同类型、同粒度”的单条列表项。",
            "",
            "优先级规则：",
            "用户修正指令 > 原片段语义一致性 > 表达优化",
            "",
            "质量要求：",
            "1. 改写应更清晰、更自然、更具体，但不能改变原意。",
            "2. 避免空泛表达，如“更加精彩”“进一步发展”等。",
            "3. 保证与前后文衔接自然，但不要重复前后文内容。",
          ].join("\n")
    ),
    new HumanMessage(
      [
        "用户修正指令：",
        input.instruction,
        "",
        "核心角色：",
        input.charactersText,
        "",
        "世界上下文：",
        input.worldContext,
        "",
        "片段前文（仅供理解，不可改写）：",
        input.before || "（无）",
        "",
        "片段后文（仅供理解，不可改写）：",
        input.after || "（无）",
        "",
        "待改写片段：",
        input.selectedText,
        "",
        "输出要求：",
        "1. 只输出“待改写片段”的改写结果。",
        "2. 不要输出前文/后文，不要解释说明。",
        "3. 若用户指令与原内容冲突，以“原片段核心语义 + 用户修正指令”为准做最小改动。",
      ].join("\n")
    ),
  ],
};

export const novelDraftOptimizeFullPrompt: PromptAsset<NovelDraftOptimizeFullPromptInput, string, string> = {
  id: "novel.draft_optimize.full",
  version: "v1",
  taskType: "repair",
  mode: "text",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  render: (input) => [
    new SystemMessage(
      input.target === "structured_outline"
        ? [
            "你是结构化小说大纲编辑器。",
            "你的任务是基于用户修正指令，对整个 JSON 草稿进行结构内优化，使其更清晰、可执行且自洽。",
            "",
            "只输出优化后的 JSON，不要输出解释、Markdown、注释或额外文本。",
            "",
            "硬规则：",
            "1. 输出必须是合法 JSON，结构必须与原草稿一致（通常为 JSON 数组）。",
            "2. 不得改变字段层级、字段名或整体结构。",
            "3. 不得新增无关字段，不得删除必要字段。",
            "4. 所有改动必须发生在原结构内部。",
            "",
            "优先级规则：",
            "用户修正指令 > 原草稿语义一致性 > 表达优化",
            "",
            "优化目标：",
            "1. 让每一项更具体、可执行，而不是抽象概念。",
            "2. 修正逻辑不清、冲突或重复的部分。",
            "3. 强化结构内的因果关系与推进逻辑。",
            "4. 保持与核心角色与世界规则一致，不得越界。",
            "",
            "质量要求：",
            "1. 输出必须可直接用于后续生成流程。",
            "2. 避免空泛表达，如“推进剧情”“增加冲突”。",
            "3. 不要无意义重写未被指令影响的部分，保持最小必要改动。",
          ].join("\n")
        : [
            "你是小说策划编辑，负责对整段发展走向草稿进行整体优化。",
            "你的任务是在不破坏设定的前提下，让草稿更清晰、更有推进力、更适合继续写作。",
            "",
            "只输出优化后的完整草稿，不要输出解释、标题或额外文本。",
            "",
            "硬规则：",
            "1. 必须保持核心角色设定、世界规则和已有事件因果一致。",
            "2. 不得引入未给出的关键新设定、角色或世界规则。",
            "3. 不得删除草稿中已成立的关键剧情节点。",
            "",
            "优先级规则：",
            "用户修正指令 > 原草稿结构与语义一致性 > 表达优化",
            "",
            "优化目标：",
            "1. 让整体走向更清晰：每一段都要知道“在推进什么”。",
            "2. 强化冲突与推进，而不是平铺叙述。",
            "3. 消除重复、模糊或逻辑断裂的部分。",
            "4. 让内容更适合继续展开为章节，而不是停留在概念层。",
            "",
            "质量要求：",
            "1. 表达要具体，避免“进一步发展”“展开冲突”这类空话。",
            "2. 段落之间要有明显因果或递进关系。",
            "3. 优先做结构优化，而不是简单润色。",
            "4. 在未被指令影响的部分，尽量保持原结构，避免无意义重写。",
          ].join("\n")
    ),
    new HumanMessage(
      [
        "用户修正指令：",
        input.instruction,
        "",
        "核心角色：",
        input.charactersText,
        "",
        "世界上下文：",
        input.worldContext,
        "",
        "当前草稿：",
        input.currentDraft,
      ].join("\n")
    ),
  ],
};
