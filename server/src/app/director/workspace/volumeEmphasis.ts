import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { anchorVolumeEmphasis, volumeEmphasisSchema, type AnchoredVolumeEmphasis, type VolumeEmphasisSource } from "@ai-novel/shared/types/director/volumeEmphasis";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { PrismaRunRepository } from "../../../modules/director";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import type { PromptExecutionOptions } from "../../../prompting/core/promptTypes";
import { volumeEmphasisInstructions, volumeSummaryEmphasisPrompt } from "../../../prompting/prompts/novel/volume/summaryEmphasis.prompt";
import { resolveDataRoot } from "../../../runtime/appPaths";
import { readNovelBookDirector } from "../../../services/novel/catalog";
import { normalizeVolumeWorkspaceDocument } from "../../../services/novel/volume/volumeWorkspaceDocument";
import { getActiveVersionRow } from "../../../services/novel/volume/volumeWorkspacePersistence";
import { directorVolumeChapterPlanFilter } from "../planning";

const inFlight = new Map<string, Promise<AnchoredVolumeEmphasis[]>>();

async function annotateBatch(volumes: VolumeEmphasisSource[], options: PromptExecutionOptions) {
  const key = createHash("sha256").update(JSON.stringify([volumeSummaryEmphasisPrompt.version, volumeEmphasisInstructions, options.novelId, volumes])).digest("hex");
  const pending = inFlight.get(key);
  if (pending) return pending;
  const dir = path.join(resolveDataRoot(), "storage", "volume-summary-emphasis");
  const file = path.join(dir, key + ".json");
  const job = (async () => {
    try {
      const cached = volumeEmphasisSchema.parse(JSON.parse(await readFile(file, "utf8")));
      return anchorVolumeEmphasis(volumes, cached);
    } catch { /* A missing or outdated derived annotation can be recomputed. */ }
    const { output } = await runStructuredPrompt({ asset: volumeSummaryEmphasisPrompt, promptInput: { volumes }, options });
    const result = anchorVolumeEmphasis(volumes, output);
    try {
      await mkdir(dir, { recursive: true });
      const temp = path.join(dir, key + "." + randomUUID() + ".tmp");
      await writeFile(temp, JSON.stringify(output), "utf8");
      await rename(temp, file);
    } catch (error) { console.warn("无法缓存分卷重点标注", error); }
    return result;
  })();
  inFlight.set(key, job);
  try { return await job; } finally { inFlight.delete(key); }
}

export async function annotateVolumeSummaries(novelId: string, ids: string[]) {
  const [novel, version] = await Promise.all([
    prisma.novel.findUnique({ where: { id: novelId }, select: { id: true, directorVersion: true, directorEpoch: true, narrativeForm: true } }),
    getActiveVersionRow(novelId),
  ]);
  if (!novel) throw new AppError("小说不存在。", 404);
  const raw = version?.contentJson ?? { volumes: await prisma.volumePlan.findMany({
    where: { ...directorVolumeChapterPlanFilter(novelId), id: { in: ids } }, orderBy: { sortOrder: "asc" },
  }) };
  const sources = normalizeVolumeWorkspaceDocument(novelId, raw).volumes.flatMap(volume =>
    ids.includes(volume.id) && volume.summary?.trim() ? [{ id: volume.id, summary: volume.summary }] : []);
  if (!sources.length) return [];
  const director = await readNovelBookDirector(novel);
  const contract = director ? await new PrismaRunRepository().getContract(director.runId) : null;
  return annotateBatch(sources, { novelId, entrypoint: "director_next", stage: "volume_summary_emphasis",
    provider: contract?.modelConfig?.route, model: contract?.modelConfig?.model, temperature: 0.1 });
}
