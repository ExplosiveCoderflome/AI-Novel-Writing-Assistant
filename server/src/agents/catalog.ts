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

function inferUiKind(toolName: string): string {
  if (toolName === "create_novel" || toolName === "select_novel_workspace") {
    return "workspace_action";
  }
  if (toolName.startsWith("generate_") || toolName === "sync_chapters_from_structured_outline" || toolName === "get_novel_production_status") {
    return "production_stage";
  }
  if (toolName.includes("failure") || toolName.includes("blocker") || toolName.includes("conflict")) {
    return "diagnostic_card";
  }
  if (toolName.startsWith("list_")) {
    return "resource_list";
  }
  if (toolName.includes("chapter_content") || toolName.includes("summarize")) {
    return "chapter_reader";
  }
  if (toolName.includes("preview") || toolName.includes("queue") || toolName.includes("retry")) {
    return "task_action";
  }
  return "default";
}

function inferFollowupActions(toolName: string): string[] {
  if (toolName === "create_novel") {
    return ["继续完善设定", "绑定当前工作区", "开始创建章节"];
  }
  if (toolName === "generate_world_for_novel") {
    return ["继续生成角色", "查看世界观", "检查世界观冲突"];
  }
  if (toolName === "generate_novel_characters") {
    return ["继续生成圣经", "查看角色状态", "继续整本生成"];
  }
  if (toolName === "generate_story_bible" || toolName === "generate_novel_outline" || toolName === "generate_structured_outline") {
    return ["继续整本生成", "查看整本生产状态", "检查当前资产准备情况"];
  }
  if (toolName === "get_novel_production_status") {
    return ["继续生成当前小说", "为什么整本生成没有启动", "查看当前章节目录"];
  }
  if (toolName === "select_novel_workspace") {
    return ["继续围绕该小说操作", "查看章节", "发起写作"];
  }
  if (toolName.includes("failure") || toolName.includes("blocker")) {
    return ["查看相关任务", "继续追问失败原因", "尝试重试"];
  }
  if (toolName.startsWith("list_")) {
    return ["筛选结果", "在创作中枢继续", "打开对应模块"];
  }
  if (toolName.includes("chapter")) {
    return ["继续总结", "发起重写", "检查冲突"];
  }
  return ["继续追问", "打开对应模块"];
}

export function buildAgentCatalog(): AgentCatalog {
  return {
    agents: DOMAIN_AGENTS,
    tools: listAgentToolDefinitions().map((tool) => ({
      ...tool,
      uiKind: inferUiKind(tool.name),
      followupActions: inferFollowupActions(tool.name),
    })),
    approvalPolicySummary: getPermissionMatrixSummary()
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean),
  };
}
