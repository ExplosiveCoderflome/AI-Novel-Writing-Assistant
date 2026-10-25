import type { CreativeProfileStage } from "@ai-novel/shared/types/creativeProfile";
import { prisma } from "../../../../db/prisma";
import type { CreativePromptGuidance } from "../../../../prompting/prompts/creativeProfile/creativePromptGuidance";
import { readStoredCreativeProfile, type CreativeProfileReadResult } from "../domain/creativeProfileCodec";
import { toCreativePromptGuidance } from "./toCreativePromptGuidance";

export async function loadCreativeProfileRead(novelId: string | null | undefined): Promise<CreativeProfileReadResult> {
  if (!novelId) return { status: "unset" };
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    select: { creativeProfileJson: true },
  });
  return readStoredCreativeProfile(novel);
}

/** 生产链路的统一入口：按书读取并编译某一阶段的取向指导；未设置返回 null。 */
export async function loadCreativePromptGuidance(
  novelId: string | null | undefined,
  stage: CreativeProfileStage,
): Promise<CreativePromptGuidance | null> {
  return toCreativePromptGuidance(await loadCreativeProfileRead(novelId), stage);
}
