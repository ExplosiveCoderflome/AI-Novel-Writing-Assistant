import type {VolumePlanDocument} from "@ai-novel/shared/types/novel";
import {prisma} from "../../../../../db/prisma";
import {normalizeVolumeWorkspaceDocument} from "../../../volume/volumeWorkspaceDocument";

/** Read the canonical version snapshot directly. Never initialize/migrate a workspace in a GET. */
export async function readInitialScheduleDocument(novelId:string) {
  const version=await prisma.volumePlanVersion.findFirst({where:{novelId,status:"active"},orderBy:[{version:"desc"},{id:"desc"}]});
  return version ? {version,document:normalizeVolumeWorkspaceDocument(novelId,version.contentJson)} : null;
}

export function initialScheduleByOrder(document:VolumePlanDocument|null) {
  return new Map(document?.volumes.flatMap(volume=>volume.chapters)
    .filter(chapter=>chapter.plannedCharacterIds!==undefined).map(chapter=>[chapter.chapterOrder,chapter.plannedCharacterIds!]) ?? []);
}
