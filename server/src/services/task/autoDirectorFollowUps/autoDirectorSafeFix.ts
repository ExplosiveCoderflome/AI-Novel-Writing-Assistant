import type {
  AutoDirectorValidationRequiredAction,
  AutoDirectorValidationRequiredActionCode,
  AutoDirectorValidationResult,
} from "@ai-novel/shared/types/autoDirectorValidation";
import { prisma } from "../../../db/prisma";

const SAFE_FIX_ACTION_CODES = new Set<AutoDirectorValidationRequiredActionCode>([
  "clear_checkpoint",
  "clear_failure",
  "cancel_replaced_tasks",
  "reset_downstream_state",
  "revalidate_assets",
]);

const FORBIDDEN_SAFE_FIX_ACTION_CODES = new Set<AutoDirectorValidationRequiredActionCode>([
  "create_rewrite_snapshot",
]);

export interface AutoDirectorSafeFixPlan {
  safeActions: AutoDirectorValidationRequiredAction[];
  blockedActions: AutoDirectorValidationRequiredAction[];
}

function isSafeRequiredAction(action: AutoDirectorValidationRequiredAction): boolean {
  return action.safeToAutoFix === true
    && action.riskLevel === "low"
    && SAFE_FIX_ACTION_CODES.has(action.code)
    && !FORBIDDEN_SAFE_FIX_ACTION_CODES.has(action.code);
}

export function buildAutoDirectorSafeFixPlan(
  validationResult: AutoDirectorValidationResult | null | undefined,
): AutoDirectorSafeFixPlan {
  const requiredActions = validationResult?.allowed === false
    ? validationResult.requiredActions
    : [];
  const safeActions = requiredActions.filter(isSafeRequiredAction);
  return {
    safeActions,
    blockedActions: requiredActions.filter((action) => !safeActions.includes(action)),
  };
}

export function canApplyAutoDirectorSafeFix(
  validationResult: AutoDirectorValidationResult | null | undefined,
): boolean {
  const plan = buildAutoDirectorSafeFixPlan(validationResult);
  return Boolean(validationResult && validationResult.allowed === false && plan.safeActions.length > 0 && plan.blockedActions.length === 0);
}

export async function applyAutoDirectorSafeFix(input: {
  taskId: string;
  seedPayloadJson: string | null | undefined;
  validationResult: AutoDirectorValidationResult;
  healed: boolean;
}): Promise<{
  safeActionCodes: AutoDirectorValidationRequiredActionCode[];
}> {
  const plan = buildAutoDirectorSafeFixPlan(input.validationResult);
  if (plan.safeActions.length === 0) {
    throw new Error("当前没有可安全修复项，请先重新校验或人工处理。");
  }
  if (plan.blockedActions.length > 0) {
    throw new Error("当前校验项包含高风险动作，不能安全修复，请人工处理。");
  }

  let seedPayload: Record<string, unknown> = {};
  if (input.seedPayloadJson?.trim()) {
    try {
      const parsed = JSON.parse(input.seedPayloadJson) as unknown;
      seedPayload = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      seedPayload = {};
    }
  }
  delete seedPayload.autoDirectorValidationResult;
  delete seedPayload.validationResult;
  const nestedValidation = seedPayload.autoDirectorValidation;
  if (nestedValidation && typeof nestedValidation === "object" && !Array.isArray(nestedValidation)) {
    seedPayload.autoDirectorValidation = {
      ...nestedValidation as Record<string, unknown>,
      result: null,
      lastSafeFixAt: new Date().toISOString(),
    };
  }
  seedPayload.autoDirectorSafeFix = {
    appliedAt: new Date().toISOString(),
    actionCodes: plan.safeActions.map((action) => action.code),
    healed: input.healed,
  };

  await prisma.novelWorkflowTask.update({
    where: { id: input.taskId },
    data: {
      seedPayloadJson: JSON.stringify(seedPayload),
      pendingManualRecovery: false,
      heartbeatAt: new Date(),
      lastError: null,
    },
  });

  return {
    safeActionCodes: plan.safeActions.map((action) => action.code),
  };
}
