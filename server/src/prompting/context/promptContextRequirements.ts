import type { PromptAsset, PromptContextRequirement } from "../core/promptTypes";

export function derivePromptContextRequirements(
  asset: Pick<PromptAsset<unknown, unknown, unknown>, "contextPolicy" | "contextRequirements">,
): PromptContextRequirement[] {
  if (asset.contextRequirements && asset.contextRequirements.length > 0) {
    return asset.contextRequirements;
  }

  const required = (asset.contextPolicy.requiredGroups ?? []).map((group, index) => ({
    group,
    required: true,
    priority: 100 - index,
    sourceHint: "asset.contextPolicy.requiredGroups",
  } satisfies PromptContextRequirement));
  const preferred = (asset.contextPolicy.preferredGroups ?? []).map((group, index) => ({
    group,
    required: false,
    priority: 50 - index,
    sourceHint: "asset.contextPolicy.preferredGroups",
  } satisfies PromptContextRequirement));
  return [...required, ...preferred];
}
