const CONSISTENCY_FIELD_LABELS: Record<string, string> = {
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

export interface ConsistencyIssueDraft {
  severity: "pass" | "warn" | "error";
  code: string;
  message: string;
  detail?: string;
  source: "rule" | "llm";
  targetField?: string;
}

const ISSUE_LOCALIZATION: Record<
  string,
  {
    title: string;
    message: string;
    detail?: string | ((targetField?: string) => string);
  }
> = {
  AXIOM_MAGIC_CONFLICT: {
    title: "公理与力量体系冲突",
    message: "世界公理与力量体系设定发生冲突。",
    detail: "当前公理中限制或否定了超自然/魔法能力，但力量体系或相关文本又出现了对应内容。需要统一世界底层规则。",
  },
  TECH_ERA_MISMATCH: {
    title: "技术时代混杂",
    message: "技术时代感混杂，缺少足够解释。",
    detail: "当前技术描述同时出现了不同时代层级的元素，但没有交代来源、限制或过渡逻辑。",
  },
  CONFLICT_WEAK: {
    title: "核心冲突偏弱",
    message: "核心冲突信息过薄，支撑力不足。",
    detail: "建议补充冲突双方、触发事件、升级路径和失败代价，让世界主矛盾更清晰。",
  },
  BASELINE_PASS: {
    title: "规则检查通过",
    message: "规则层面未发现明显硬冲突。",
  },
  THEMATIC_INCOHERENCE: {
    title: "主题框架不一致",
    message: "检索补充内容引入了与核心设定不一致的主题框架。",
    detail: "当前辅助上下文加入了原始设定里没有明确建立的主题表达，容易让世界观主轴发生漂移。",
  },
  REDUNDANT_AXIOM_APPLICATION: {
    title: "世界公理重复套用",
    message: "补充内容重复复述了既有公理，没有增加新的有效约束。",
    detail: "这类重复会放大噪音，降低世界规则的辨识度，建议保留真正有用的新约束或删去冗余复述。",
  },
  AXIOM_VIOLATION: {
    title: "世界公理冲突",
    message: "世界名或核心概念与已定义公理、背景存在冲突。",
    detail: (targetField) =>
      `当前设定与既有世界公理不一致${targetField ? `，主要影响字段是${localizeConsistencyField(targetField)}` : ""}。需要统一命名、题材承诺和世界底层规则。`,
  },
  GENRE_MISMATCH: {
    title: "题材信号冲突",
    message: "题材信号与当前世界观约束不一致。",
    detail: "当前命名、关键词或检索上下文传递出了另一种题材预期，和世界观强调的风格与规则不匹配。",
  },
};

function hasChinese(text: string): boolean {
  return /[\u4E00-\u9FFF]/.test(text);
}

function looksMostlyEnglish(text: string): boolean {
  return /[A-Za-z]/.test(text) && !hasChinese(text);
}

export function localizeConsistencyField(targetField?: string | null): string {
  if (!targetField) {
    return "未指定";
  }
  return CONSISTENCY_FIELD_LABELS[targetField] ?? targetField;
}

export function localizeConsistencyIssue(issue: ConsistencyIssueDraft): ConsistencyIssueDraft {
  const code = issue.code?.trim() || "LLM_REVIEW";
  const localization = ISSUE_LOCALIZATION[code];
  const message = issue.message?.trim() || "";
  const detail = issue.detail?.trim();

  if (localization) {
    return {
      ...issue,
      code,
      message: hasChinese(message) ? message : localization.message,
      detail: detail && hasChinese(detail)
        ? detail
        : typeof localization.detail === "function"
          ? localization.detail(issue.targetField)
          : localization.detail,
    };
  }

  return {
    ...issue,
    code,
    message: hasChinese(message)
      ? message
      : `${localizeConsistencyField(issue.targetField)}存在一致性风险。`,
    detail: !detail
      ? undefined
      : looksMostlyEnglish(detail)
        ? `系统检测到一条${localizeConsistencyField(issue.targetField)}相关问题，请结合当前世界观设定复核这项风险。`
        : detail,
  };
}

export function buildConsistencySummary(status: "pass" | "warn" | "error", errorCount: number, warnCount: number): string {
  if (status === "pass") {
    return "一致性检查通过，未发现明显硬冲突。";
  }
  if (status === "error") {
    return `检测到 ${errorCount} 个严重冲突，${warnCount} 个警告项。`;
  }
  return `检测到 ${warnCount} 个警告项，建议继续修正。`;
}
