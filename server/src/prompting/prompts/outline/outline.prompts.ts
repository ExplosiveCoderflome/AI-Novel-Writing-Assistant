import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

import { volumeBeatsSchema, volumeBeatSlotKeySchema } from "@ai-novel/shared/types/volumeBeatSheet";
import { inferRequiredChapterCountFromBeatSheet, validateBeatSheetChapterCoverage } from "@ai-novel/shared/types/volumeBeatCoverage";
import { beatPlanningInstruction } from "./volumeBeats.prompt";

const nodeSchema = z.object({ clientRef: z.string().min(1), title: z.string(), summary: z.string(), planningDepth: z.enum(["rough", "detailed"]).default("rough"), reason: z.string(), sourceFragment: z.string() });
export const initialSchema = z.object({ storyFields: z.object({ title: z.string(), premise: z.string(), synopsis: z.string(), theme: z.string(), tone: z.string(), endingDirection: z.string() }), volumes: z.array(nodeSchema), chapters: z.array(nodeSchema.extend({ volumeRef: z.string() })), characters: z.array(nodeSchema.extend({ role: z.string() })), payoffs: z.array(nodeSchema.extend({ setupDescription: z.string(), payoffDescription: z.string() })), facts: z.array(nodeSchema.extend({ content: z.string() })) });
const draftSchema = initialSchema.extend({
  characters: z.array(nodeSchema.extend({
    title: z.string().trim().min(1), summary: z.string().trim().min(1),
    role: z.string(), appearanceRefs: z.array(z.string().min(1)),
  })),
});
const pacedDraftSchema = draftSchema.extend({
  volumes: z.array(nodeSchema.extend({beats: volumeBeatsSchema.optional()})),
  chapters: z.array(nodeSchema.extend({volumeRef:z.string(), beatKey:volumeBeatSlotKeySchema})),
});
export type InitialOutlineDraft = z.infer<typeof pacedDraftSchema>;
export type SavedInitialOutlineDraft = Omit<InitialOutlineDraft, "characters" | "chapters"> & {
  chapters: Array<Omit<InitialOutlineDraft["chapters"][number], "beatKey"> & {beatKey?: InitialOutlineDraft["chapters"][number]["beatKey"]}>;
  characters: Array<z.infer<typeof initialSchema>["characters"][number] & { appearanceRefs?: string[] }>;
};

export function initialReferenceError(draft: SavedInitialOutlineDraft): string | undefined {
  const { volumes, chapters, characters, payoffs, facts } = draft;
  const allRefs = [...volumes, ...chapters, ...characters, ...payoffs, ...facts].map(node => node.clientRef);
  if (new Set(allRefs).size !== allRefs.length) return "初稿中多个节点使用了同一引用。";
  const volumeRefs = new Set(volumes.map(node => node.clientRef));
  if (chapters.some(chapter => !volumeRefs.has(chapter.volumeRef))) return "初稿中有章节找不到所属卷。";
  for (const vol of volumes) {
    const local = chapters.filter(ch => ch.volumeRef === vol.clientRef);
    if (local.some(ch => ch.beatKey && !vol.beats?.some(b => b.key === ch.beatKey))) return `「${vol.title}」的章节须关联本卷已有节奏段。`;
    if (vol.beats) {
      const target = Math.max(local.length, inferRequiredChapterCountFromBeatSheet({beats: vol.beats}));
      const coverage = validateBeatSheetChapterCoverage({beatSheet:{beats:vol.beats}, targetChapterCount:target});
      if (!coverage.accepted) return coverage.message!;
    }
  }
  const locations = new Set([...volumeRefs, ...chapters.map(node => node.clientRef)]);
  for (const person of characters) {
    if (person.appearanceRefs?.some(ref => !locations.has(ref))) return `人物「${person.title}」的出场位置必须指向本初稿的卷或章节。`;
  }
}
export const initialDraftSchema = draftSchema.superRefine((draft, context) => {
  if (!draft.storyFields.premise.trim() && !draft.storyFields.synopsis.trim() &&
      ![draft.volumes, draft.chapters, draft.characters, draft.payoffs, draft.facts].some(group => group.length)) {
    context.addIssue({ code: "custom", message: "请把本轮讨论整理为实际的故事初稿。" });
  }
  const message = initialReferenceError(draft);
  if (message) context.addIssue({ code: "custom", message });
});
export const pacedInitialDraftSchema = pacedDraftSchema.superRefine((draft, ctx) => {
  const issue = initialReferenceError(draft);
  if (issue) ctx.addIssue({code:"custom", message:issue});
  if (!draft.storyFields.premise.trim() && !draft.storyFields.synopsis.trim() && ![draft.volumes,draft.characters,draft.payoffs,draft.facts].some(group => group.length))
    ctx.addIssue({code:"custom",message:"请提供实际的故事初稿。"});
});
export const initialCastInstruction = "为推动情节的主要人物建档。title 沿用作者确定的姓名或称呼，role 写故事作用，summary 保留讨论中确定的来历、身份变化与处境。appearanceRefs 列出实际计划出场的章节 clientRef；只确定到卷时写卷 clientRef。仅被提及或尚未安排出场时可填空数组。";
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
export const editSchema = z.object({ operations: z.array(operationSchema).min(1) }).superRefine((payload, context) => {
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

type InitialInput = { idea: string; genre?: string; audience?: string; rough: boolean };
export const outlineInitialGenerateV1 = {
  id: "outline.initial_generate", version: "v1", taskType: "planner", mode: "structured", language: "zh", contextPolicy: { maxTokensBudget: 8000 }, outputSchema: initialSchema,
  render: input => [new SystemMessage("你是帮助写作新手完成长篇小说大纲的规划助手。根据想法生成完整总纲、适量卷与首批章节；远期章节保持粗纲。卷数与章节数按内容需要决定，不要固定五卷。节点只给 clientRef，不要生成稳定 ID。输出严格符合结构。"), new HumanMessage(JSON.stringify(input))],
} satisfies PromptAsset<InitialInput, z.infer<typeof initialSchema>>;
export const outlineInitialGenerateV2: PromptAsset<InitialInput & { conversation?: {
  history: { author: string; assistant: string | null }[]; document: unknown;
  priorProposal: { status: string; kind: string; payload: unknown } | null; draftDirection: string;
} }, z.infer<typeof initialDraftSchema>> = {
  ...outlineInitialGenerateV1, version: "v2", outputSchema: initialDraftSchema,
  render: input => [new SystemMessage([
    "为作者生成一份可采纳的完整小说初稿。结合创作要求、已保存的大纲、对话中的决定及上一份提案，把总纲、分卷、首批章节、人物、伏笔和设定直接写入相应字段。近期章节具体，远期可保留粗纲；按故事需要决定数量。",
    "每个节点使用唯一的 clientRef，章节 volumeRef 指向本次生成的卷。", initialCastInstruction,
  ].join("\n")), new HumanMessage(JSON.stringify(input))],
};
export const outlineInitialGeneratePrompt = {
  ...outlineInitialGenerateV1, version:"v3", outputSchema:pacedInitialDraftSchema,
  render: (input, context) => {
    const [system, user] = outlineInitialGenerateV2.render(input, context);
    return [new SystemMessage(String(system.content) + "\n" + beatPlanningInstruction), user];
  },
} satisfies PromptAsset<Parameters<typeof outlineInitialGenerateV2.render>[0], InitialOutlineDraft>;
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
