import type { AgentCatalog, AgentCatalogAgent } from "@ai-novel/shared/types/agent";
import { getPermissionMatrixSummary } from "./approvalPolicy";
import { listAgentToolDefinitions } from "./toolRegistry";

const DOMAIN_AGENTS: AgentCatalogAgent[] = [
  {
    name: "Coordinator",
    title: "创作总控",
    description: "负责跨模块规划、状态汇总、任务诊断和动作编排。",
    resourceScopes: ["global", "task", "agent_run", "generation_job"],
  },
  {
    name: "NovelAgent",
    title: "小说中枢",
    description: "负责小说、章节、快照、创作决策和章节生成链路。",
    resourceScopes: ["novel", "chapter", "creative_decision", "snapshot", "generation_job"],
  },
  {
    name: "BookAnalysisAgent",
    title: "拆书分析官",
    description: "负责拆书任务、分析结果和知识沉淀。",
    resourceScopes: ["book_analysis", "knowledge_document", "task"],
  },
  {
    name: "KnowledgeAgent",
    title: "知识档案官",
    description: "负责知识文档、索引状态、召回诊断和绑定关系。",
    resourceScopes: ["knowledge_document", "task"],
  },
  {
    name: "WorldAgent",
    title: "世界观编务",
    description: "负责世界观状态、冲突诊断、快照和小说绑定。",
    resourceScopes: ["world", "snapshot", "novel"],
  },
  {
    name: "FormulaAgent",
    title: "公式编修师",
    description: "负责写作公式的管理、适配解释和风格沉淀。",
    resourceScopes: ["writing_formula", "novel", "chapter"],
  },
  {
    name: "CharacterAgent",
    title: "角色档案官",
    description: "负责基础角色库、模板复用和角色上下文。",
    resourceScopes: ["base_character", "novel", "chapter"],
  },
];

export function buildAgentCatalog(): AgentCatalog {
  return {
    agents: DOMAIN_AGENTS,
    tools: listAgentToolDefinitions(),
    approvalPolicySummary: getPermissionMatrixSummary()
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean),
  };
}
