import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

const nodeSchema = z.object({ clientRef: z.string().min(1), title: z.string(), summary: z.string(), planningDepth: z.enum(["rough", "detailed"]).default("rough"), reason: z.string(), sourceFragment: z.string() });
const initialSchema = z.object({ storyFields: z.object({ title: z.string(), premise: z.string(), synopsis: z.string(), theme: z.string(), tone: z.string(), endingDirection: z.string() }), volumes: z.array(nodeSchema), chapters: z.array(nodeSchema.extend({ volumeRef: z.string() })), characters: z.array(nodeSchema.extend({ role: z.string() })), payoffs: z.array(nodeSchema.extend({ setupDescription: z.string(), payoffDescription: z.string() })), facts: z.array(nodeSchema.extend({ content: z.string() })) });
const operationSchema = z.object({ operationId: z.string(), kind: z.enum(["add_node", "update_fields", "remove_node", "move_node"]), nodeType: z.enum(["volume", "chapter", "character", "payoff", "fact"]).optional(), nodeId: z.string().optional(), clientRef: z.string().optional(), parentNodeId: z.string().optional(), fields: z.record(z.string(), z.unknown()).optional(), reason: z.string(), affectedNodeIds: z.array(z.string()), dependsOn: z.array(z.string()), risks: z.array(z.string()) });
const editSchema = z.object({ operations: z.array(operationSchema).min(1) });
const importSchema = z.object({ nodes: z.array(nodeSchema.extend({ nodeType: z.enum(["volume", "chapter", "character", "payoff", "fact"]), parentRef: z.string().optional(), sourceFragment: z.string() })), unclassifiedFragments: z.array(z.string()), coverageNotes: z.array(z.string()) });

export const outlineInitialGeneratePrompt: PromptAsset<{ idea: string; genre?: string; audience?: string; rough: boolean }, z.infer<typeof initialSchema>> = {
  id: "outline.initial_generate", version: "v1", taskType: "planner", mode: "structured", language: "zh", contextPolicy: { maxTokensBudget: 8000 }, outputSchema: initialSchema,
  render: input => [new SystemMessage("你是帮助写作新手完成长篇小说大纲的规划助手。根据想法生成完整总纲、适量卷与首批章节；远期章节保持粗纲。节点只给 clientRef，不要生成稳定 ID。输出严格符合结构。"), new HumanMessage(JSON.stringify(input))],
};
export const outlineEditProposalPrompt: PromptAsset<{ request: string; baseVersion: number; document: unknown; scope: string }, z.infer<typeof editSchema>> = {
  id: "outline.edit_proposal", version: "v1", taskType: "planner", mode: "structured", language: "zh", contextPolicy: { maxTokensBudget: 8000 }, outputSchema: editSchema,
  render: input => [new SystemMessage("你为独立大纲提出可审阅的结构化操作，不要直接替换整份文档。说明每项理由、影响、依赖和风险；只输出结构化操作。"), new HumanMessage(JSON.stringify(input))],
};
export const outlineImportParsePrompt: PromptAsset<{ text: string; format: "markdown" | "text"; chunkIndex: number; chunkCount: number }, z.infer<typeof importSchema>> = {
  id: "outline.import_parse", version: "v1", taskType: "planner", mode: "structured", language: "zh", contextPolicy: { maxTokensBudget: 8000 }, outputSchema: importSchema,
  render: input => [new SystemMessage("将用户提供的文本片段理解为待确认的大纲节点，不要补造缺失内容。逐段覆盖输入；无法分类的原文放入 unclassifiedFragments。标题格式仅作为线索，不得据此静默丢弃文本。"), new HumanMessage(JSON.stringify(input))],
};
