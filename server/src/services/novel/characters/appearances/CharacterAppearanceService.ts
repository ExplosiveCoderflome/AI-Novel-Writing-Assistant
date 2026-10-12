import {z} from "zod";
import type {Prisma} from "@prisma/client";
import {characterAppearanceSchema, type CharacterAppearance, type DirectorCharacterAppearances, type DirectorNovelCharacterAppearances} from "@ai-novel/shared/types/director/characterAppearances";
import {prisma} from "../../../../db/prisma";
import {withSqliteRetry} from "../../../../db/sqliteRetry";
import {AppError} from "../../../../middleware/errorHandler";
import {buildChapterArtifactContentHash, ChapterArtifactContentVersionError} from "../../runtime/artifactSync/contracts";
import {assertNovelDirectorVersion, readRunExecutionEpoch} from "../../../../modules/novel/director-routing";
import {initialScheduleByOrder,readInitialScheduleDocument} from "./planning/InitialScheduleDocument";

export const CHARACTER_APPEARANCE_ARTIFACT = "director_v2_character_appearances:v1";
const projectionSchema = z.object({schemaVersion: z.literal(1), records: z.array(characterAppearanceSchema),
  coverage: z.enum(["recorded", "untracked"])});
type AppearanceInput = {novelId: string; chapterId: string; content: string; contentHash: string;
  appearances?: CharacterAppearance[]; directorRunId?: string};

/** Also used inside candidate confirmation's transaction to bind deferred first appearances. */
export async function writeCharacterAppearances(tx: Prisma.TransactionClient, input: AppearanceInput) {
  if (buildChapterArtifactContentHash(input.content) !== input.contentHash) throw new ChapterArtifactContentVersionError();
  const chapter = await tx.chapter.findFirst({where: {id: input.chapterId, novelId: input.novelId, content: input.content}, select: {id: true}});
  if (!chapter) throw new ChapterArtifactContentVersionError();
  const locked = await tx.chapter.updateMany({where: {id: input.chapterId, novelId: input.novelId, content: input.content}, data: {content: input.content}});
  if (!locked.count) throw new ChapterArtifactContentVersionError();
  const characters = await tx.character.findMany({where: {novelId: input.novelId}, select: {id: true, name: true}});
  const records: CharacterAppearance[] = [];
  let complete = input.appearances !== undefined && !await tx.characterCandidate.count({where: {
    novelId: input.novelId, sourceChapterId: input.chapterId, status: "v2_pending",
  }});
  for (const item of input.appearances ?? []) {
    // Exact structured identities only. No name search in prose, alias guessing, or cross-book IDs.
    const matches = characters.filter(c => item.characterId ? c.id === item.characterId && c.name === item.characterName : c.name === item.characterName);
    if (matches.length !== 1 || !input.content.replace(/\s+/g, " ").includes(item.evidence.replace(/\s+/g, " ").trim())) {
      complete = false;
      continue;
    }
    if (!records.some(r => r.characterId === matches[0].id && r.kind === item.kind)) records.push({...item, characterId: matches[0].id});
  }
  const identity = {novelId: input.novelId, chapterId: input.chapterId, contentHash: input.contentHash,
    artifactType: CHARACTER_APPEARANCE_ARTIFACT, syncMode: "director_v2"};
  const data = {status: "succeeded", metadataJson: JSON.stringify({schemaVersion: 1, records, coverage: complete ? "recorded" : "untracked"})};
  await tx.chapterArtifactSyncCheckpoint.upsert({where: {novelId_chapterId_contentHash_artifactType_syncMode: identity},
    create: {...identity, ...data}, update: data});
}

export class CharacterAppearanceService {
  async applyFinalChapter(input: AppearanceInput) {
    await withSqliteRetry(() => prisma.$transaction(async tx => {
      if (!input.directorRunId) throw new AppError("角色出场回填缺少本次创作归属。", 409);
      const run = await tx.directorNextRun.findFirst({where: {id: input.directorRunId, novelId: input.novelId}});
      if (!run) throw new AppError("角色出场记录不属于本次创作。", 409);
      const epoch = readRunExecutionEpoch(run.contractJson);
      const lock = await tx.novel.updateMany({where: {id: input.novelId, directorEpoch: epoch}, data: {directorEpoch: {increment: 0}}});
      if (!lock.count) throw new AppError("本书创作归属已变化。", 409);
      await assertNovelDirectorVersion(input.novelId, "v2", epoch, tx);
      const current = await tx.directorNextRun.findFirst({where: {novelId: input.novelId}, orderBy: [{createdAt:"desc"},{id:"desc"}], select:{id:true}});
      if (current?.id !== run.id) throw new AppError("本次创作已被后续批次替换，不能回填角色出场记录。", 409);
      const control = await tx.directorNextRunControl.findUnique({where: {runId: run.id}});
      if (!control || !["queued", "running"].includes(control.status)) throw new AppError("本次创作已停止，不能回填角色出场记录。", 409);
      const active = await tx.directorNextRunControl.updateMany({where: {runId: run.id, status: control.status, version: control.version}, data: {version: {increment: 0}}});
      if (!active.count) throw new AppError("本次创作状态已变化。", 409);
      await writeCharacterAppearances(tx, input);
    }), {label: "director_v2.character_appearances"});
  }

  async read(novelId: string, characterId: string): Promise<DirectorCharacterAppearances> {
    await assertNovelDirectorVersion(novelId, "v2");
    const character = await prisma.character.findFirst({where: {id: characterId, novelId}, select: {id: true, name: true}});
    if (!character) throw new AppError("本书没有这个角色。", 404);
    const chapters = await this.readChapters(novelId, [character]);
    return {novelId, characterId, chapters: chapters.map(({plannedCharacterIds, ...chapter}) => ({
      ...chapter, planned: plannedCharacterIds.includes(characterId),
    }))};
  }

  async readNovel(novelId: string): Promise<DirectorNovelCharacterAppearances> {
    await assertNovelDirectorVersion(novelId, "v2");
    const characters = await prisma.character.findMany({where: {novelId}, select: {id: true, name: true}});
    return {novelId, chapters: await this.readChapters(novelId, characters)};
  }

  private async readChapters(novelId: string, characters: Array<{id: string; name: string}>): Promise<DirectorNovelCharacterAppearances["chapters"]> {
    const [chapters, plans, rows, initialSnapshot] = await Promise.all([
      prisma.chapter.findMany({where: {novelId}, orderBy: {order: "asc"}, select: {id: true, title: true, order: true, content: true}}),
      prisma.storyPlan.findMany({where: {novelId, level: "chapter", status: {not: "stale"}, participantsJson:{not:null}, chapter: {novelId}},
        orderBy: [{updatedAt: "desc"}, {id: "desc"}], select: {chapterId: true, participantsJson: true}}),
      prisma.chapterArtifactSyncCheckpoint.findMany({where: {novelId, artifactType: CHARACTER_APPEARANCE_ARTIFACT, syncMode: "director_v2", status: "succeeded"},
        select: {chapterId: true, contentHash: true, metadataJson: true}}),
      readInitialScheduleDocument(novelId),
    ]);
    const participants = new Map<string, string[]>();
    for (const plan of plans) {
      if (!plan.chapterId || participants.has(plan.chapterId)) continue;
      try {const names: unknown = JSON.parse(plan.participantsJson ?? "[]");
        participants.set(plan.chapterId, z.array(z.string()).parse(names));
      } catch {/* Invalid detailed plans do not erase a valid initial schedule. */}
    }
    const projections = new Map(rows.map(row => [`${row.chapterId}:${row.contentHash}`, row]));
    const characterIds = new Set(characters.map(character => character.id));
    const initialPlans=initialScheduleByOrder(initialSnapshot?.document ?? null);
    return chapters.map(chapter => {
      const row = projections.get(`${chapter.id}:${buildChapterArtifactContentHash(chapter.content ?? "")}`);
      let projection: z.infer<typeof projectionSchema> | null = null;
      if (row) {try {projection = projectionSchema.parse(JSON.parse(row.metadataJson ?? "null"));} catch {/* Historical invalid records remain untracked. */}}
      return {chapterId: chapter.id, chapterOrder: chapter.order, chapterTitle: chapter.title,
        plannedCharacterIds: participants.has(chapter.id)
          ? characters.filter(character => (participants.get(chapter.id) ?? []).includes(character.name)).map(character => character.id)
          : (initialPlans.get(chapter.order) ?? []).filter(id=>characterIds.has(id)),
        ...(participants.has(chapter.id) ? {planSource:"task" as const} : initialPlans.has(chapter.order) ? {planSource:"initial" as const} : {}),
        coverage: chapter.content?.trim() ? projection?.coverage ?? "untracked" : "unwritten",
        events: (projection?.records ?? []).filter(r => characterIds.has(r.characterId)),
      };
    });
  }
}

export const characterAppearanceService = new CharacterAppearanceService();
