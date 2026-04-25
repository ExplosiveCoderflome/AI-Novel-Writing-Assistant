import type {
  AutoDirectorAffectedScope,
  AutoDirectorValidationRequiredAction,
  AutoDirectorValidationRequiredActionCode,
  AutoDirectorValidationResult,
} from "@ai-novel/shared/types/autoDirectorValidation";
import type {
  AutoDirectorFollowUpValidationSummary,
} from "@ai-novel/shared/types/autoDirectorFollowUp";

const REQUIRED_ACTION_CODES: readonly AutoDirectorValidationRequiredActionCode[] = [
  "clear_checkpoint",
  "clear_failure",
  "create_rewrite_snapshot",
  "cancel_replaced_tasks",
  "reset_downstream_state",
  "revalidate_assets",
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
    : [];
}

function normalizeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function normalizeAffectedScope(value: unknown): AutoDirectorAffectedScope | null {
  if (!isObject(value) || typeof value.label !== "string" || !value.label.trim()) {
    return null;
  }
  if (value.type === "chapter_range") {
    const startOrder = normalizeNumber(value.startOrder);
    const endOrder = normalizeNumber(value.endOrder);
    if (startOrder && endOrder) {
      return {
        type: "chapter_range",
        label: value.label.trim(),
        startOrder,
        endOrder: Math.max(startOrder, endOrder),
      };
    }
  }
  if (value.type === "volume") {
    const volumeOrder = normalizeNumber(value.volumeOrder);
    if (volumeOrder) {
      return {
        type: "volume",
        label: value.label.trim(),
        volumeOrder,
      };
    }
  }
  if (value.type === "book") {
    return {
      type: "book",
      label: value.label.trim(),
    };
  }
  return null;
}

function normalizeRequiredAction(value: unknown): AutoDirectorValidationRequiredAction | null {
  if (!isObject(value) || typeof value.code !== "string") {
    return null;
  }
  const code = value.code as AutoDirectorValidationRequiredActionCode;
  if (!REQUIRED_ACTION_CODES.includes(code)) {
    return null;
  }
  const riskLevel = value.riskLevel === "medium" || value.riskLevel === "high"
    ? value.riskLevel
    : "low";
  return {
    code,
    label: typeof value.label === "string" && value.label.trim()
      ? value.label.trim()
      : "重新校验任务状态",
    riskLevel,
    safeToAutoFix: value.safeToAutoFix === true,
  };
}

function normalizeValidationResult(value: unknown): AutoDirectorValidationResult | null {
  if (!isObject(value) || value.allowed !== false) {
    return null;
  }
  const affectedScope = normalizeAffectedScope(value.affectedScope) ?? {
    type: "book",
    label: "当前任务范围",
  };
  return {
    allowed: false,
    blockingReasons: normalizeStringArray(value.blockingReasons),
    warnings: normalizeStringArray(value.warnings),
    requiredActions: Array.isArray(value.requiredActions)
      ? value.requiredActions
        .map((item) => normalizeRequiredAction(item))
        .filter((item): item is AutoDirectorValidationRequiredAction => Boolean(item))
      : [],
    affectedScope,
    nextCheckpoint: typeof value.nextCheckpoint === "string" ? value.nextCheckpoint as AutoDirectorValidationResult["nextCheckpoint"] : null,
    nextAction: typeof value.nextAction === "string" && value.nextAction.trim()
      ? value.nextAction.trim()
      : "revalidate",
  };
}

export function extractBlockedAutoDirectorValidationResult(
  seedPayloadJson: string | null | undefined,
): AutoDirectorValidationResult | null {
  if (!seedPayloadJson?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(seedPayloadJson) as {
      validationResult?: unknown;
      autoDirectorValidationResult?: unknown;
      autoDirectorValidation?: {
        result?: unknown;
      };
    };
    return normalizeValidationResult(parsed.autoDirectorValidationResult)
      ?? normalizeValidationResult(parsed.validationResult)
      ?? normalizeValidationResult(parsed.autoDirectorValidation?.result);
  } catch {
    return null;
  }
}

export function summarizeAutoDirectorValidationResult(
  result: AutoDirectorValidationResult,
): AutoDirectorFollowUpValidationSummary {
  return {
    blockingReasons: result.blockingReasons,
    warnings: result.warnings,
    requiredActions: result.requiredActions,
    affectedScope: result.affectedScope,
    nextAction: result.nextAction ?? null,
  };
}
