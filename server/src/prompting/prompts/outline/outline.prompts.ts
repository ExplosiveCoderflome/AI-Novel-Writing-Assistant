import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

const nodeSchema = z.object({ clientRef: z.string().min(1), title: z.string(), summary: z.string(), planningDepth: z.enum(["rough", "detailed"]).default("rough"), reason: z.string(), sourceFragment: z.string() });
const initialSchema = z.object({ storyFields: z.object({ title: z.string(), premise: z.string(), synopsis: z.string(), theme: z.string(), tone: z.string(), endingDirection: z.string() }), volumes: z.array(nodeSchema), chapters: z.array(nodeSchema.extend({ volumeRef: z.string() })), characters: z.array(nodeSchema.extend({ role: z.string() })), payoffs: z.array(nodeSchema.extend({ setupDescription: z.string(), payoffDescription: z.string() })), facts: z.array(nodeSchema.extend({ content: z.string() })) });
const operationSchema = z.object({
  operationId: z.string().min(1),
  kind: z.enum(["add_node", "update_fields", "remove_node", "move_node"]),
  nodeType: z.enum(["volume", "chapter", "character", "payoff", "fact"]).optional(),
  nodeId: z.string().optional(),
  clientRef: z.string().optional(),
  parentNodeId: z.string().optional(),
  fields: z.record(z.string(), z.unknown()).optional(),
  reason: z.string(),
  affectedNodeIds: z.array(z.string()),
  dependsOn: z.array(z.string()),
  risks: z.array(z.string()),
}).superRefine((operation, context) => {
  if (operation.kind === "add_node") {
    if (!operation.nodeType) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "新增节点必须指定 nodeType", path: ["nodeType"] });
    }
    if (!operation.clientRef?.trim()) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "新增节点必须提供 clientRef", path: ["clientRef"] });
    }
    if (operation.nodeType === "chapter") {
      const volumeNodeId = typeof operation.fields?.volumeNodeId === "string" ? operation.fields.volumeNodeId.trim() : "";
      if (!volumeNodeId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "新增章节必须在 fields.volumeNodeId 填写所属卷（已有卷的 nodeId，或同提案新建卷的 clientRef）",
          path: ["fields", "volumeNodeId"],
        });
      }
    }
  }
  if ((operation.kind === "update_fields" || operation.kind === "remove_node" || operation.kind === "move_node") && !operation.nodeId?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "更新/删除/移动必须指定 nodeId", path: ["nodeId"] });
  }
  if (operation.kind === "move_node" && !operation.parentNodeId?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "移动章节必须指定 parentNodeId（目标卷）", path: ["parentNodeId"] });
  }
  if (operation.kind === "update_fields" && operation.fields && Object.prototype.hasOwnProperty.call(operation.fields, "chapterNodeIds")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "禁止直接修改 chapterNodeIds；新增章节请用 add_node + fields.volumeNodeId",
      path: ["fields", "chapterNodeIds"],
    });
  }
});
const editSchema = z.object({ operations: z.array(operationSchema).min(1) }).superRefine((payload, context) => {
  const ids = payload.operations.map((operation) => operation.operationId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "operationId 必须唯一", path: ["operations"] });
  }
  const idSet = new Set(ids);
  payload.operations.forEach((operation, index) => {
    for (const dependencyId of operation.dependsOn) {
      if (!idSet.has(dependencyId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "dependsOn 只能引用同一提案中的其他 operationId，不能填写节点 ID",
          path: ["operations", index, "dependsOn"],
        });
      }
    }
  });
});
const importSchema = z.object({ nodes: z.array(nodeSchema.extend({ nodeType: z.enum(["volume", "chapter", "character", "payoff", "fact"]), parentRef: z.string().optional(), sourceFragment: z.string() })), unclassifiedFragments: z.array(z.string()), coverageNotes: z.array(z.string()) });

export const outlineInitialGeneratePrompt: PromptAsset<{ idea: string; genre?: string; audience?: string; rough: boolean }, z.infer<typeof initialSchema>> = {
  id: "outline.initial_generate", version: "v1", taskType: "planner", mode: "structured", language: "zh", contextPolicy: { maxTokensBudget: 8000 }, outputSchema: initialSchema,
  render: input => [new SystemMessage("你是帮助写作新手完成长篇小说大纲的规划助手。根据想法生成完整总纲、适量卷与首批章节；远期章节保持粗纲。卷数与章节数按内容需要决定，不要固定五卷。节点只给 clientRef，不要生成稳定 ID。输出严格符合结构。"), new HumanMessage(JSON.stringify(input))],
};
export const outlineEditProposalPrompt: PromptAsset<{ request: string; baseVersion: number; document: unknown; scope: string }, z.infer<typeof editSchema>> = {
  id: "outline.edit_proposal", version: "v2", taskType: "planner", mode: "structured", language: "zh", contextPolicy: { maxTokensBudget: 8000 }, outputSchema: editSchema,
  render: input => [new SystemMessage([
    "你为独立大纲提出可审阅的结构化操作，不要直接替换整份文档。",
    "dependsOn 只能填写同一提案中其他操作的 operationId，禁止填写卷/章节等节点 ID。",
    "新增章节必须使用 kind=add_node、nodeType=chapter，并在 fields.volumeNodeId 中给出所属卷：已有卷用其 nodeId，同提案新建卷用该卷 add_node 的 clientRef。",
    "禁止通过 update_fields 修改卷的 chapterNodeIds 来表达新增或重排章节；移动章节用 move_node + parentNodeId。",
    "说明每项理由、影响、依赖和风险；只输出结构化操作。",
    "reason、risks 等面向用户的文字必须使用中文字段名（如主题、基调、不可违背），用节点标题描述关联修改，不得夹带 theme、immutable=false、operationId 等内部字段名、操作 ID 或节点 ID；结构化字段和引用仍按 schema 输出。",
  ].join("")), new HumanMessage(JSON.stringify(input))],
};
export const outlineImportParsePrompt: PromptAsset<{ text: string; format: "markdown" | "text"; chunkIndex: number; chunkCount: number }, z.infer<typeof importSchema>> = {
  id: "outline.import_parse", version: "v1", taskType: "planner", mode: "structured", language: "zh", contextPolicy: { maxTokensBudget: 8000 }, outputSchema: importSchema,
  render: input => [new SystemMessage("将用户提供的文本片段理解为待确认的大纲节点，不要补造缺失内容。逐段覆盖输入；无法分类的原文放入 unclassifiedFragments。标题格式仅作为线索，不得据此静默丢弃文本。若 Markdown 顶部一级标题是书名，它是大纲标题，不要把书名识别为空卷；只有真正的卷标题才输出 volume。人物、伏笔、固定设定等分类标题不是节点；其下每个人物、伏笔、设定分别输出独立节点，人物的 title 是姓名，不要将多个人物合并为名叫“人物”的节点。"), new HumanMessage(JSON.stringify(input))],
};
