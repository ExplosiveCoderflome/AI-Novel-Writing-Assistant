import type {RunContract} from "../domain";
import type {InitialArtifact} from "./ports";

export interface ExistingNovelAsset {
  type: string;
  contentRef: string;
  content: unknown;
  usable: boolean;
  scope?: string;
}
/** Presence and completeness come from saved business schemas, never a legacy task seed. */
export async function inferExistingAssets(contract: RunContract, deps: {
  read: (contract: RunContract) => Promise<readonly ExistingNovelAsset[]>;
  contentHash: (content: unknown) => string;
}): Promise<readonly InitialArtifact[]> {
  const assets = await deps.read(contract);
  const seen = new Set<string>();
  return assets.map(asset => {
    const key = `${asset.type}:${asset.scope ?? contract.scope}`;
    if (!asset.type || !asset.contentRef || seen.has(key)) throw new Error("小说资产快照不完整或重复。");
    seen.add(key);
    return {type: asset.type, scope: asset.scope ?? contract.scope, status: asset.usable ? "confirmed" : "stale",
      protectedUserContent: true, contentRef: asset.contentRef, contentHash: deps.contentHash(asset.content)};
  });
}
