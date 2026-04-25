import type { NovelWorkflowCheckpoint } from "./novelWorkflow";

export const DIRECTOR_AUTO_APPROVAL_GROUPS = [
  {
    id: "low_risk_continue",
    label: "低风险继续",
    description: "已准备好的下一步继续推进，不清除资产。",
  },
  {
    id: "planning_review",
    label: "规划类审核",
    description: "角色准备、卷战略、节奏拆章等规划资产通过后继续。",
  },
  {
    id: "chapter_execution",
    label: "正文执行",
    description: "章节范围或卷范围进入章节执行。",
  },
  {
    id: "repair_replan",
    label: "修复 / 重规划",
    description: "低风险修复后继续；重规划和大范围返工建议人工确认。",
  },
  {
    id: "rewrite_cleanup",
    label: "重写清理",
    description: "重新生成或重写会清理目标范围资产，需谨慎授权。",
  },
] as const;

export type DirectorAutoApprovalGroupId = typeof DIRECTOR_AUTO_APPROVAL_GROUPS[number]["id"];

export const DIRECTOR_AUTO_APPROVAL_POINTS = [
  {
    code: "candidate_direction_confirmed",
    groupId: "low_risk_continue",
    label: "候选方向确认后继续",
    description: "确认书级方向后，允许 AI 继续建书并进入主链。",
    riskLevel: "low",
  },
  {
    code: "character_setup_ready",
    groupId: "planning_review",
    label: "角色准备通过后继续",
    description: "角色阵容应用完成后，允许 AI 继续生成卷战略。",
    riskLevel: "low",
  },
  {
    code: "volume_strategy_ready",
    groupId: "planning_review",
    label: "卷战略通过后继续",
    description: "卷战略和卷骨架完成后，允许 AI 继续节奏拆章。",
    riskLevel: "low",
  },
  {
    code: "structured_outline_ready",
    groupId: "planning_review",
    label: "节奏拆章完成后继续",
    description: "目标范围拆章和章节执行资源准备好后，允许 AI 继续到写作阶段。",
    riskLevel: "low",
  },
  {
    code: "chapter_execution_continue",
    groupId: "chapter_execution",
    label: "章节执行批次完成后继续",
    description: "一个章节批次完成后，允许 AI 继续处理剩余章节。",
    riskLevel: "medium",
  },
  {
    code: "low_risk_quality_repair_continue",
    groupId: "repair_replan",
    label: "低风险质量修复后继续",
    description: "质量修复结果明确为低风险时，允许 AI 继续章节执行。",
    riskLevel: "medium",
  },
  {
    code: "replan_continue",
    groupId: "repair_replan",
    label: "重规划处理后继续",
    description: "重规划会改变后续执行路径，授权前建议先人工确认。",
    riskLevel: "high",
  },
  {
    code: "rewrite_cleanup_confirmed",
    groupId: "rewrite_cleanup",
    label: "重新生成 / 重写确认后继续",
    description: "目标范围资产清理后，允许 AI 继续重写流程。",
    riskLevel: "high",
  },
] as const;

export type DirectorAutoApprovalPointCode = typeof DIRECTOR_AUTO_APPROVAL_POINTS[number]["code"];
export type DirectorAutoApprovalRiskLevel = typeof DIRECTOR_AUTO_APPROVAL_POINTS[number]["riskLevel"];

export interface DirectorAutoApprovalPoint {
  code: DirectorAutoApprovalPointCode;
  groupId: DirectorAutoApprovalGroupId;
  label: string;
  description: string;
  riskLevel: DirectorAutoApprovalRiskLevel;
}

export interface DirectorAutoApprovalGroup {
  id: DirectorAutoApprovalGroupId;
  label: string;
  description: string;
}

export interface DirectorAutoApprovalConfig {
  enabled: boolean;
  approvalPointCodes: DirectorAutoApprovalPointCode[];
}

export interface DirectorAutoApprovalPreferenceSettings {
  approvalPointCodes: DirectorAutoApprovalPointCode[];
  approvalPoints: DirectorAutoApprovalPoint[];
  groups: DirectorAutoApprovalGroup[];
}

export const DEFAULT_DIRECTOR_AUTO_APPROVAL_POINT_CODES: DirectorAutoApprovalPointCode[] = [
  "candidate_direction_confirmed",
  "character_setup_ready",
  "volume_strategy_ready",
  "structured_outline_ready",
];

const AUTO_APPROVAL_POINT_CODE_SET = new Set<string>(
  DIRECTOR_AUTO_APPROVAL_POINTS.map((item) => item.code),
);

const CHECKPOINT_APPROVAL_POINT_MAP: Partial<Record<NovelWorkflowCheckpoint, DirectorAutoApprovalPointCode>> = {
  candidate_selection_required: "candidate_direction_confirmed",
  character_setup_required: "character_setup_ready",
  volume_strategy_ready: "volume_strategy_ready",
  front10_ready: "structured_outline_ready",
  chapter_batch_ready: "chapter_execution_continue",
  replan_required: "replan_continue",
};

export function isDirectorAutoApprovalPointCode(value: unknown): value is DirectorAutoApprovalPointCode {
  return typeof value === "string" && AUTO_APPROVAL_POINT_CODE_SET.has(value);
}

export function normalizeDirectorAutoApprovalPointCodes(
  values: readonly unknown[] | null | undefined,
  fallback: readonly DirectorAutoApprovalPointCode[] = DEFAULT_DIRECTOR_AUTO_APPROVAL_POINT_CODES,
): DirectorAutoApprovalPointCode[] {
  const source = Array.isArray(values) ? values : fallback;
  const result: DirectorAutoApprovalPointCode[] = [];
  for (const value of source) {
    if (!isDirectorAutoApprovalPointCode(value) || result.includes(value)) {
      continue;
    }
    result.push(value);
  }
  return result;
}

export function normalizeDirectorAutoApprovalConfig(input: unknown): DirectorAutoApprovalConfig {
  if (!input || typeof input !== "object") {
    return {
      enabled: false,
      approvalPointCodes: [...DEFAULT_DIRECTOR_AUTO_APPROVAL_POINT_CODES],
    };
  }
  const record = input as {
    enabled?: unknown;
    approvalPointCodes?: unknown;
  };
  return {
    enabled: record.enabled === true,
    approvalPointCodes: normalizeDirectorAutoApprovalPointCodes(
      Array.isArray(record.approvalPointCodes) ? record.approvalPointCodes : null,
    ),
  };
}

export function resolveDirectorAutoApprovalPointForCheckpoint(
  checkpointType: NovelWorkflowCheckpoint | string | null | undefined,
): DirectorAutoApprovalPointCode | null {
  if (!checkpointType || typeof checkpointType !== "string") {
    return null;
  }
  return CHECKPOINT_APPROVAL_POINT_MAP[checkpointType as NovelWorkflowCheckpoint] ?? null;
}

export function shouldAutoApproveDirectorCheckpoint(
  config: DirectorAutoApprovalConfig | null | undefined,
  checkpointType: NovelWorkflowCheckpoint | string | null | undefined,
): boolean {
  if (!config?.enabled) {
    return false;
  }
  const pointCode = resolveDirectorAutoApprovalPointForCheckpoint(checkpointType);
  return Boolean(pointCode && config.approvalPointCodes.includes(pointCode));
}
