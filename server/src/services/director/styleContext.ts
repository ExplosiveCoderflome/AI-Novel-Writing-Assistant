import { buildStyleIntentSummary } from "@ai-novel/shared/types/styleEngine";
import type { StyleProfileService } from "../styleEngine/StyleProfileService";
import type { StyleBindingService } from "../styleEngine/StyleBindingService";

export interface DirectorStyleContextDeps {
  styleProfileService: StyleProfileService;
  styleBindingService: StyleBindingService;
}

export async function enrichDirectorStyleContext<
  T extends { styleProfileId?: string; styleTone?: string; styleIntentSummary?: unknown },
>(
  deps: DirectorStyleContextDeps,
  input: T,
): Promise<T> {
  const styleProfileId = input.styleProfileId?.trim() || undefined;
  let styleProfile = null;
  if (styleProfileId) {
    styleProfile = await deps.styleProfileService.getProfileById(styleProfileId);
    if (!styleProfile) {
      throw new Error("所选写法资产不存在。");
    }
  }

  const styleIntentSummary = buildStyleIntentSummary({
    styleProfile,
    styleTone: input.styleTone,
  });
  return {
    ...input,
    styleProfileId,
    styleIntentSummary: styleIntentSummary ?? undefined,
  };
}

export async function ensurePrimaryNovelStyleBinding(
  deps: DirectorStyleContextDeps,
  novelId: string,
  styleProfileId: string | null | undefined,
): Promise<void> {
  const normalizedProfileId = styleProfileId?.trim();
  if (!normalizedProfileId) {
    return;
  }
  const existingBindings = await deps.styleBindingService.listBindings({
    targetType: "novel",
    targetId: novelId,
  });
  if (existingBindings.some((binding) => binding.styleProfileId === normalizedProfileId)) {
    return;
  }
  const nextPriority = Math.max(1, ...existingBindings.map((binding) => binding.priority)) + 1;
  await deps.styleBindingService.createBinding({
    styleProfileId: normalizedProfileId,
    targetType: "novel",
    targetId: novelId,
    priority: nextPriority,
    weight: 1,
    enabled: true,
  });
}
