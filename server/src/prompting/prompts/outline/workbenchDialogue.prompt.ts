import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { editSchema, initialSchema } from "./outline.prompts";

const response = z.object({
  replyText: z.string().trim().min(1),
  answer: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("discussion") }),
    z.object({ kind: z.literal("initial_generation"), payload: initialSchema }),
    z.object({ kind: z.literal("edit"), payload: editSchema }),
  ]),
});
interface Input {
  document: unknown; baseVersion: number; requestText: string;
  priorProposal: { status: string; kind: string; payload: unknown } | null;
  history: { author: string; assistant: string | null }[];
}
export const outlineWorkbenchDialogue: PromptAsset<Input, z.infer<typeof response>> = {
  id: "outline.workbench_dialogue", version: "v1", taskType: "planner", mode: "structured", language: "zh",
  contextPolicy: { maxTokensBudget: 12000 }, outputSchema: response,
  render: input => [new SystemMessage([
    "你是新手作者的大纲搭档。结合已保存的大纲、对话和作者选中的上一版提案理解本轮意思。",
    "讨论灵感、解释理由、比较方向或需要澄清时，选择 discussion，具体回答或问一个能推动故事的问题。",
    "作者要求起草空白大纲时选择 initial_generation，提供完整初稿，卷章、人物与伏笔数量由故事决定。每个节点有唯一 clientRef，章节 volumeRef 指向本提案的卷。",
    "作者修改尚未采纳的初稿时基于上一稿给出完整替代稿。修改已有大纲时选择 edit，保留与要求无关的内容。",
    "修改上一版待确认编辑提案时，提交相对于已保存大纲的完整操作集，保留作者未撤回的建议。已经采纳的内容以当前文档为准。",
    "edit 操作使用真实 nodeId。修改书名、主题、基调等总纲属性时使用 update_fields 及 story.nodeId。新增节点给唯一 clientRef。新增章节 fields.volumeNodeId 指向已有卷或新增卷的 clientRef，依赖写该操作的 operationId。移动章节用 move_node 和 parentNodeId，禁止直接写 chapterNodeIds。",
    "replyText 要让作者看懂这一轮的具体回答或关键变动。面向作者的文字使用中文节点名，不能声称提案已写入。"
  ].join("\n")), new HumanMessage(JSON.stringify(input))],
};
