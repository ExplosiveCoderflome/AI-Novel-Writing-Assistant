import type {Prisma} from "@prisma/client";
import type {LLMProvider} from "@ai-novel/shared/types/llm";
import {prisma} from "../../../../db/prisma";
import {runWithLlmUsageTracking} from "../../../../llm/usageTracking";
import {novelSideEffectJobService, NovelSideEffectLeaseLostError} from "../../../../events/sideEffects/NovelSideEffectJobService";
import type {DirectorV2CharacterEnrichmentPayload} from "../../../../events/sideEffects/NovelSideEffectJobTypes";
import {isCurrentV2ChapterProductionCompleted} from "../../production/completion";
import {CHAPTER_ARTIFACT_BOUNDARY_TYPE} from "../../runtime/artifactSync";
import {CharacterVisibleProfileService, VISIBLE_PROFILE_FIELDS} from "../../characterProfile/CharacterVisibleProfileService";
import {characterMindService} from "../../characterMind/CharacterMindService";
import {directorV2Available} from "../../../../modules/novel/director-routing";

type ReadDatabase = Pick<Prisma.TransactionClient, "novel" | "directorNextRun" | "characterCastOption" | "generationJob" | "novelSideEffectJob">;
type EnrichmentLease = {id: string; leaseOwner: string | null};
class StaleEnrichment extends Error {}
class DeferredEnrichment extends Error {}
const hasText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/** V2-owned scheduling and enrichment. Never reads legacy task seeds or changes director control. */
export class DirectorV2CharacterEnrichmentService {
  constructor(private readonly db = prisma, private readonly jobs = novelSideEffectJobService) {}

  private async readOwner(novelId: string, runId: string, db: ReadDatabase = this.db) {
    const [novel, run] = await Promise.all([
      db.novel.findUnique({where: {id: novelId}, select: {directorVersion: true, directorEpoch: true}}),
      db.directorNextRun.findUnique({where: {id: runId}, include: {control: true}}),
    ]);
    if (!novel || !run || run.novelId !== novelId || ["cancelled", "failed"].includes(run.control?.status ?? "")
      || (novel.directorVersion !== "v2" && novel.directorVersion !== null)) return null;
    try {
      const contract = JSON.parse(run.contractJson);
      const epoch = contract.executionEpoch ?? 0;
      if (contract.novelId !== novelId || contract.runId !== runId || !Number.isSafeInteger(epoch)
        || epoch < 0 || epoch !== novel.directorEpoch || !hasText(contract.modelConfig?.route)
        || !hasText(contract.modelConfig?.model) || contract.modelConfig.route === "default"
        || contract.modelConfig.model === "default") return null;
      return {epoch, provider: contract.modelConfig.route as LLMProvider,
        model: contract.modelConfig.model as string, temperature: contract.launchInput?.temperature as number | undefined};
    } catch {return null;}
  }

  async scheduleAfterPipeline(novelId: string, jobId: string): Promise<void> {
    const job = await this.db.generationJob.findUnique({where: {id: jobId}});
    if (!directorV2Available() || !job || job.novelId !== novelId || job.status !== "succeeded") return;
    let runId: string;
    try {runId = JSON.parse(job.payload ?? "{}").directorNext?.runId;} catch {return;}
    if (!hasText(runId)) return;
    const owner = await this.readOwner(novelId, runId);
    if (!owner) return;
    const chapters = await this.db.chapter.findMany({
      where: {novelId, order: {gte: job.startOrder, lte: job.endOrder}},
      include: {artifactSyncCheckpoints: {where: {artifactType: CHAPTER_ARTIFACT_BOUNDARY_TYPE, status: "succeeded"},
        orderBy: {updatedAt: "desc"}, take: 6}},
    });
    // The retained final text must cross the resource boundary, including debt closures.
    if (!chapters.some(isCurrentV2ChapterProductionCompleted)) return;
    const option = await this.db.characterCastOption.findFirst({where: {novelId, status: "applied"},
      orderBy: [{updatedAt: "desc"}, {id: "asc"}], include: {members: true}});
    if (!option) return;
    const characters = await this.db.character.findMany({where: {novelId, name: {in: option.members.map(m => m.name)}},
      orderBy: [{createdAt: "asc"}, {id: "asc"}], select: {id: true}});
    if (!characters.length) return;
    await this.jobs.enqueueJob({novelId, jobType: "character.v2DeferredEnrichment",
      idempotencyKey: `character.v2DeferredEnrichment:${novelId}:${owner.epoch}:${option.id}`,
      payload: {novelId, runId, executionEpoch: owner.epoch, optionId: option.id,
        characterIds: characters.map(c => c.id)}, maxAttempts: 3});
  }

  private async assertWritable(payload: DirectorV2CharacterEnrichmentPayload, db: ReadDatabase = this.db, lease?: EnrichmentLease) {
    if (!directorV2Available()) throw new DeferredEnrichment();
    if (lease && (!lease.leaseOwner || !await db.novelSideEffectJob.findFirst({where: {
      id: lease.id, status: "running", leaseOwner: lease.leaseOwner, leaseExpiresAt: {gt: new Date()},
    }, select: {id: true}}))) throw new NovelSideEffectLeaseLostError("Character enrichment lease lost.");
    const owner = await this.readOwner(payload.novelId, payload.runId, db);
    const option = await db.characterCastOption.findFirst({where: {novelId: payload.novelId, status: "applied"},
      orderBy: [{updatedAt: "desc"}, {id: "asc"}], select: {id: true}});
    if (!owner || owner.epoch !== payload.executionEpoch || option?.id !== payload.optionId) throw new StaleEnrichment();
    const busy = await db.generationJob.findFirst({where: {novelId: payload.novelId,
      status: {in: ["queued", "running"]}}, select: {id: true}});
    if (busy) throw new DeferredEnrichment();
    return owner;
  }

  async execute(payload: DirectorV2CharacterEnrichmentPayload, lease?: EnrichmentLease): Promise<"completed" | "skipped" | "deferred"> {
    if (!payload || !hasText(payload.novelId) || !hasText(payload.runId) || !hasText(payload.optionId)
      || !Number.isSafeInteger(payload.executionEpoch) || payload.executionEpoch < 0
      || !Array.isArray(payload.characterIds) || !payload.characterIds.length || !payload.characterIds.every(hasText)) {
      throw new Error("导演 V2 角色补全任务缺少有效的执行归属。");
    }
    try {
      const owner = await this.assertWritable(payload, this.db, lease);
      const characters = await this.db.character.findMany({where: {novelId: payload.novelId,
        id: {in: [...new Set(payload.characterIds)]}}, orderBy: [{createdAt: "asc"}, {id: "asc"}]});
      await runWithLlmUsageTracking({novelId: payload.novelId, directorNextRunId: payload.runId,
        workflowTaskId: null, generationJobId: null, directorRunId: null, directorTelemetry: false,
        stage: "character_enrichment"}, async () => {
        // Shared world/event modules also import this adapter. Resolve collaborators after module initialization.
        const profiles = new CharacterVisibleProfileService();
        for (const character of characters) {
          if (VISIBLE_PROFILE_FIELDS.every(field => hasText(character[field]))) continue;
          await this.assertWritable(payload, this.db, lease);
          const suggestion = await profiles.generateCharacterVisibleProfile(payload.novelId, character.id, {
            provider: owner.provider, model: owner.model, temperature: owner.temperature,
            userGuidance: "只补空白的稳定外显资料；保留所有已有设定，不补临时伤势、物品归属或人物位置。",
          });
          await this.db.$transaction(async tx => {
            await this.assertWritable(payload, tx, lease);
            const current = await tx.character.findFirst({where: {id: character.id, novelId: payload.novelId}});
            if (!current) return;
            for (const field of VISIBLE_PROFILE_FIELDS) {
              if (hasText(current[field]) || !hasText(suggestion.fields[field])) continue;
              // Preserve edits made during the model call, including a concurrent fill of this field.
              await tx.character.updateMany({where: {id: character.id, novelId: payload.novelId,
                [field]: current[field], novel: {directorEpoch: payload.executionEpoch,
                  OR: [{directorVersion: "v2"}, {directorVersion: null}]}}, data: {[field]: suggestion.fields[field]}});
            }
          });
        }
        const existingMinds = await this.db.characterMindSnapshot.findMany({where: {novelId: payload.novelId,
          characterId: {in: characters.map(c => c.id)}, isCurrent: true}, select: {characterId: true}});
        const present = new Set(existingMinds.map(m => m.characterId));
        const missing = characters.filter(c => !present.has(c.id)).map(c => c.id);
        for (let from = 0; from < missing.length; from += 6) {
          await characterMindService.bootstrapMindStates(payload.novelId, missing.slice(from, from + 6), {
            provider: owner.provider, model: owner.model, temperature: owner.temperature, onlyMissing: true,
            assertWriteOwnership: db => this.assertWritable(payload, db, lease).then(() => undefined),
          });
        }
      });
      return "completed";
    } catch (error) {
      if (error instanceof StaleEnrichment) return "skipped";
      if (error instanceof DeferredEnrichment) return "deferred";
      throw error;
    }
  }
}

export const directorV2CharacterEnrichmentService = new DirectorV2CharacterEnrichmentService();
