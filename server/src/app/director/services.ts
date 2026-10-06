import {decodeUsageCursor, InvocationUsageQueryService, NovelInvocationUsageQueryService} from "../../platform/llm/usage";
import {prisma} from "../../db/prisma";
import {createDirectorNextServices, type DirectorNextServices} from "../../modules/director";
import {LegacyRunProjection} from "../../modules/director/http";
import {createDirectorProductionOptions} from "./productionComposition";
import {readDirectorWorkspace} from "./workspace";
import {chapterGenerationFeed} from "../../services/novel/production/observation";
import {assertNovelDirectorVersion, assertV2RunExecution, readRunExecutionEpoch} from "../../modules/novel/director-routing";
import type {DirectorCommand} from "../../modules/director/application";

let services: DirectorNextServices | null = null;
export function getDirectorProductionServices(): DirectorNextServices {
  if (!services) {
    services = createDirectorNextServices(createDirectorProductionOptions());
    const commandService = services.http.commandService;
    services.http.commandService = {execute: async input => {
      const command = input as DirectorCommand;
      if (command.type === "open_run") await assertNovelDirectorVersion(command.novelId, "v2");
      else await assertV2RunExecution(command.runId);
      return commandService.execute(command);
    }};
    services.http.readUsage = (runId,query) => new InvocationUsageQueryService(prisma.llmInvocationUsageRecord).getRunUsage(runId,query);
    services.http.validateUsageCursor = (runId, cursor) => {
      if (decodeUsageCursor(cursor).runId !== runId) throw Object.assign(new Error("分页位置不属于本次创作。"), {statusCode: 400});
    };
    services.http.readNovelUsage = (novelId, query) => new NovelInvocationUsageQueryService(prisma.llmInvocationUsageRecord, async id => {
      const novel = await prisma.novel.findUnique({where: {id}, select: {id: true, title: true}});
      if (!novel) return null;
      const [chapters, workflows, jobs] = await Promise.all([
        prisma.chapter.findMany({where: {novelId: id}, orderBy: {order: "asc"}, select: {id: true, order: true, title: true}}),
        prisma.novelWorkflowTask.findMany({where: {novelId: id}, select: {id: true}}),
        prisma.generationJob.findMany({where: {novelId: id}, select: {id: true}}),
      ]);
      return {novel, chapters, workflowTaskIds: workflows.map(row => row.id), generationJobIds: jobs.map(row => row.id)};
    }).getNovelUsage(novelId, query);
    services.http.readWorkspace = readDirectorWorkspace;
    services.http.readCurrentRunId = async novelId => {
      const identity = await assertNovelDirectorVersion(novelId, "v2");
      const runs = await prisma.directorNextRun.findMany({where: {novelId}, orderBy: {createdAt: "desc"}, select: {id: true, contractJson: true}});
      return runs.find(run => readRunExecutionEpoch(run.contractJson) === identity.epoch)?.id ?? null;
    };
    services.http.observeGeneration = (novelId, listener) => chapterGenerationFeed.subscribe(novelId, listener);
    services.http.legacyProjection = new LegacyRunProjection({list: input => prisma.novelWorkflowTask.findMany({
      where: {lane: "auto_director", ...(input.novelId ? {novelId: input.novelId} : {})},
      orderBy: {updatedAt: "desc"}, take: input.limit,
      select: {id: true, novelId: true, title: true, status: true, progress: true, lastError: true},
    })});
  }
  return services;
}
