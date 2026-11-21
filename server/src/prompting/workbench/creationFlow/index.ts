import { createContextBlock } from "../../core/contextBudget";
import type { PromptAsset } from "../../core/promptTypes";
import { preparePromptExecution } from "../../core/promptRunner";
import { formatContextGroupLabel } from "../../context/contextGroupLabels";
import { derivePromptContextRequirements } from "../../context/promptContextRequirements";
import { createVolumeChapterListPrompt } from "../../prompts/novel/volume/chapterList.prompts";
import { createVolumeSkeletonPrompt } from "../../prompts/novel/volume/skeleton.prompts";
import { findRegisteredPromptAssetById } from "../../registry";
import { resolvePromptOverlays } from "../../slots/slotResolution";
import { serializeMessages } from "../serializeMessages";
import { creationTemplateInputs } from "./templateInputs";

type ReadingAsset = PromptAsset<unknown, unknown, unknown>;

function readingAsset(key: string): ReadingAsset | null {
  // Production constructs these assets with the actual volume/beat size.
  if (key === "novel.volume.skeleton") return createVolumeSkeletonPrompt(3) as ReadingAsset;
  if (key === "novel.volume.chapter_list") return createVolumeChapterListPrompt({
    targetChapterCount: 3, targetBeatKey: "〈节奏段编号〉", targetBeatLabel: "〈节奏段名称〉", characterIds: ["〈角色编号〉"],
  }) as ReadingAsset;
  const variants: Record<string, string> = {
    "verify-repair": "novel.chapter.acceptance_assessment",
    "next-direction-pair": "novel.director.direction_pair",
  };
  return findRegisteredPromptAssetById(variants[key] ?? key);
}

export function readCreationFlowTemplate(key: string) {
  if (!Object.prototype.hasOwnProperty.call(creationTemplateInputs, key)) return null;
  const asset = readingAsset(key);
  if (!asset) throw new Error(`找不到此步骤的注册提示词：${key}`);
  const blocks = derivePromptContextRequirements(asset).map(({ group, priority, required }) => createContextBlock({
    group, priority, required, id: group, content: `〈${formatContextGroupLabel(group)}〉`,
  }));
  const slots = resolvePromptOverlays({ slotDefs: asset.slots ?? [], globalOverrides: {}, novelOverrides: {} });
  const prepared = preparePromptExecution({ asset, promptInput: creationTemplateInputs[key as keyof typeof creationTemplateInputs],
    contextBlocks: [...blocks, ...slots.appendBlocks], resolvedSlots: slots.inlineSlots });
  return { id: asset.id, version: asset.version, messages: serializeMessages(prepared.messages) };
}
