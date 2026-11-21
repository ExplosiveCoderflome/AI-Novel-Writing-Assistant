import { createContextBlock } from "../../core/contextBudget";
import type { PromptAsset } from "../../core/promptTypes";
import { preparePromptExecution } from "../../core/promptRunner";
import { formatContextGroupLabel } from "../../context/contextGroupLabels";
import { derivePromptContextRequirements } from "../../context/promptContextRequirements";
import { createVolumeChapterListPrompt } from "../../prompts/novel/volume/chapterList.prompts";
import { createVolumeSkeletonPrompt } from "../../prompts/novel/volume/skeleton.prompts";
import { findRegisteredPromptAssetById, getRegisteredPromptAsset } from "../../registry";
import { resolvePromptOverlays } from "../../slots/slotResolution";
import { serializeMessages } from "../serializeMessages";
import { catalogInputs } from "./catalogInputs";
import { creationTemplateInputs } from "./templateInputs";

type ReadingAsset = PromptAsset<unknown, unknown, unknown>;

function readingAsset(id: string, version?: string): ReadingAsset | null {
  // The two factories bind a concrete volume or beat size into the output schema.
  const sample = id === "novel.volume.skeleton" ? createVolumeSkeletonPrompt(3)
    : id === "novel.volume.chapter_list" ? createVolumeChapterListPrompt({
      targetChapterCount: 3, targetBeatKey: "〈节奏段编号〉", targetBeatLabel: "〈节奏段名称〉", characterIds: ["〈角色编号〉"],
    }) : null;
  if (sample && (!version || version === sample.version)) return sample as ReadingAsset;
  return version ? getRegisteredPromptAsset(id, version) : findRegisteredPromptAssetById(id);
}

export function readCreationFlowTemplate(key: string) {
  const separator = key.lastIndexOf("@");
  const pinned = separator > 0 && separator < key.length - 1;
  const scene = pinned ? key.slice(0, separator) : key;
  const version = pinned ? key.slice(separator + 1) : undefined;
  const isScene = Object.prototype.hasOwnProperty.call(creationTemplateInputs, scene);
  const isCatalogExample = Object.prototype.hasOwnProperty.call(catalogInputs, key);
  if (!isCatalogExample && !isScene) return null;
  const id = scene === "verify-repair" ? "novel.chapter.acceptance_assessment"
    : scene === "next-direction-pair" ? "novel.director.direction_pair" : scene;
  if (pinned && scene !== id) return null;
  const asset = readingAsset(id, version);
  if (!asset) return null;
  const promptInput = isCatalogExample ? catalogInputs[key] : creationTemplateInputs[scene as keyof typeof creationTemplateInputs];
  const blocks = derivePromptContextRequirements(asset).map(({ group, priority, required }) => createContextBlock({
    group, priority, required, id: group, content: `〈${formatContextGroupLabel(group)}〉`,
  }));
  const slots = resolvePromptOverlays({ slotDefs: asset.slots ?? [], globalOverrides: {}, novelOverrides: {} });
  const prepared = preparePromptExecution({ asset, promptInput,
    contextBlocks: [...blocks, ...slots.appendBlocks], resolvedSlots: slots.inlineSlots });
  return { id: asset.id, version: asset.version, messages: serializeMessages(prepared.messages) };
}
