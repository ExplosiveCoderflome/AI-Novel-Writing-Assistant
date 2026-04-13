import type { WorldConsistencyIssue, WorldConsistencyReport } from "@ai-novel/shared/types/world";

const ISSUE_CODE_LABELS: Record<string, string> = {
  THEMATIC_INCOHERENCE: "主题框架不一致",
  REDUNDANT_AXIOM_APPLICATION: "世界公理重复套用",
  AXIOM_VIOLATION: "世界公理冲突",
  GENRE_MISMATCH: "题材信号冲突",
  AXIOM_MAGIC_CONFLICT: "公理与力量体系冲突",
  TECH_ERA_MISMATCH: "技术时代混杂",
  CONFLICT_WEAK: "核心冲突偏弱",
  BASELINE_PASS: "规则检查通过",
};

const ISSUE_MESSAGE_LABELS: Record<string, string> = {
  THEMATIC_INCOHERENCE: "检索补充内容引入了与核心设定不一致的主题框架。",
  REDUNDANT_AXIOM_APPLICATION: "补充内容重复复述了既有公理，没有增加新的有效约束。",
  AXIOM_VIOLATION: "世界名或核心概念与既有公理、背景存在冲突。",
  GENRE_MISMATCH: "题材信号与当前世界观约束不一致。",
  AXIOM_MAGIC_CONFLICT: "世界公理与力量体系设定发生冲突。",
  TECH_ERA_MISMATCH: "技术时代感混杂，缺少足够解释。",
  CONFLICT_WEAK: "核心冲突信息过薄，支撑力不足。",
  BASELINE_PASS: "规则层面未发现明显硬冲突。",
};

const ISSUE_DETAIL_LABELS: Record<string, string> = {
  THEMATIC_INCOHERENCE: "辅助上下文引入了原始设定里没有明确建立的主题表达，容易让世界观主轴发生漂移。",
  REDUNDANT_AXIOM_APPLICATION: "当前补充内容主要在重复已有规则，建议删去冗余复述，只保留真正新增的约束。",
  AXIOM_VIOLATION: "当前命名、题材承诺或核心概念与既有世界底层规则不一致，需要统一主设定。",
  GENRE_MISMATCH: "当前命名或关键词传递出了另一种题材预期，和世界观强调的风格与规则不匹配。",
  AXIOM_MAGIC_CONFLICT: "你在世界公理里限制了超自然/魔法内容，但力量体系或相关文本又重新引入了它。",
  TECH_ERA_MISMATCH: "当前技术描述同时出现了不同时代层级的元素，但没有交代来源、限制或过渡逻辑。",
  CONFLICT_WEAK: "建议补充冲突双方、触发事件、升级路径和失败代价，让世界主矛盾更清晰。",
};

const FIELD_LABELS: Record<string, string> = {
  description: "世界概述",
  background: "背景设定",
  geography: "地理环境",
  cultures: "文化习俗",
  magicSystem: "力量体系",
  politics: "政治结构",
  races: "种族设定",
  religions: "宗教信仰",
  technology: "技术体系",
  conflicts: "核心冲突",
  history: "历史脉络",
  economy: "经济系统",
  factions: "势力关系",
};

function hasChinese(text: string): boolean {
  return /[\u4E00-\u9FFF]/.test(text);
}

function localizeSummary(summary: string, status: WorldConsistencyReport["status"], issues: WorldConsistencyIssue[]): string {
  if (hasChinese(summary)) {
    return summary;
  }
  if (/Consistency check passed/i.test(summary)) {
    return "一致性检查通过，未发现明显硬冲突。";
  }
  const errorCount = issues.filter((item) => item.severity === "error").length;
  const warnCount = issues.filter((item) => item.severity === "warn").length;
  if (status === "error") {
    return `检测到 ${errorCount} 个严重冲突，${warnCount} 个警告项。`;
  }
  if (status === "warn") {
    return `检测到 ${warnCount} 个警告项，建议继续修正。`;
  }
  return "一致性检查已完成。";
}

export function parseConsistencyReport(raw: string | null | undefined, issues: WorldConsistencyIssue[]): WorldConsistencyReport | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<WorldConsistencyReport>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const status = parsed.status === "error" || parsed.status === "warn" || parsed.status === "pass"
      ? parsed.status
      : "pass";
    return {
      worldId: typeof parsed.worldId === "string" ? parsed.worldId : "",
      score: typeof parsed.score === "number" ? parsed.score : 0,
      summary: localizeSummary(typeof parsed.summary === "string" ? parsed.summary : "", status, issues),
      status,
      generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : undefined,
      issues,
    };
  } catch {
    return null;
  }
}

export function localizeConsistencySeverity(severity: WorldConsistencyIssue["severity"]): string {
  switch (severity) {
    case "error":
      return "严重冲突";
    case "warn":
      return "警告";
    case "pass":
      return "通过";
    default:
      return severity;
  }
}

export function localizeConsistencyStatus(status: WorldConsistencyIssue["status"] | WorldConsistencyReport["status"]): string {
  switch (status) {
    case "open":
      return "待处理";
    case "resolved":
      return "已解决";
    case "ignored":
      return "已忽略";
    case "error":
      return "存在严重冲突";
    case "warn":
      return "存在警告";
    case "pass":
      return "检查通过";
    default:
      return status;
  }
}

export function localizeConsistencySource(source: WorldConsistencyIssue["source"]): string {
  return source === "llm" ? "模型审校" : "规则检查";
}

export function localizeConsistencyField(targetField?: string | null): string {
  if (!targetField) {
    return "未指定";
  }
  return FIELD_LABELS[targetField] ?? targetField;
}

export function localizeConsistencyIssueTitle(code: string): string {
  return ISSUE_CODE_LABELS[code] ?? code;
}

export function localizeConsistencyIssueMessage(issue: WorldConsistencyIssue): string {
  if (hasChinese(issue.message)) {
    return issue.message;
  }
  return ISSUE_MESSAGE_LABELS[issue.code]
    ?? `${localizeConsistencyField(issue.targetField)}存在一致性风险。`;
}

export function localizeConsistencyIssueDetail(issue: WorldConsistencyIssue): string | null {
  if (issue.detail && hasChinese(issue.detail)) {
    return issue.detail;
  }
  if (ISSUE_DETAIL_LABELS[issue.code]) {
    return ISSUE_DETAIL_LABELS[issue.code];
  }
  if (issue.detail) {
    return `系统检测到一条${localizeConsistencyField(issue.targetField)}相关问题，请结合当前世界观设定复核这项风险。`;
  }
  return null;
}
