import {InvocationUsageQueryService} from "../../platform/llm/usage";
import {prisma} from "../../db/prisma";
import {createDirectorNextServices, type DirectorNextServices} from "../../modules/director";
import {LegacyRunProjection} from "../../modules/director/http";
import {createDirectorProductionOptions} from "./productionComposition";
import {readDirectorWorkspace} from "./workspace";
import {chapterGenerationFeed} from "../../services/novel/production/observation";

let services: DirectorNextServices | null = null;
export function getDirectorProductionServices(): DirectorNextServices {
  if (!services) {
    services = createDirectorNextServices(createDirectorProductionOptions());
    services.http.readUsage = (runId,query) => new InvocationUsageQueryService(prisma.llmInvocationUsageRecord).getRunUsage(runId,query);
    services.http.readWorkspace = readDirectorWorkspace;
    services.http.observeGeneration = (novelId, listener) => chapterGenerationFeed.subscribe(novelId, listener);
    services.http.legacyProjection = new LegacyRunProjection({list: input => prisma.novelWorkflowTask.findMany({
      where: {lane: "auto_director", ...(input.novelId ? {novelId: input.novelId} : {})},
      orderBy: {updatedAt: "desc"}, take: input.limit,
      select: {id: true, novelId: true, title: true, status: true, progress: true, lastError: true},
    })});
  }
  return services;
}
