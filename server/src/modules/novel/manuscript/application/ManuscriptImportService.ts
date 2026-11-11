import { randomUUID } from "node:crypto";
import type { ManuscriptEncoding, ManuscriptPartitionUnit } from "@ai-novel/shared";
import { prisma } from "../../../../db/prisma";
import { decodeManuscript, detectRulePartition, detectShortStoryPartition, sha256, validateManuscriptPartition } from "../domain/source";

export class ManuscriptImportService {
  async create(input: { bytes: Buffer; title: string; narrativeForm: "long_novel" | "short_story"; encoding?: ManuscriptEncoding; fileName?: string; requestKey: string }):Promise<{projectId:string;sourceId:string;sessionId:string;sourceHash:string;rawHash:string;encoding:ManuscriptEncoding;charCount:number;byteCount:number;status:"uploaded"}> {
    if (!input.title.trim() || !input.requestKey.trim() || input.requestKey.length > 160) throw new Error("MANUSCRIPT_REQUEST_INVALID");
    const decoded = decodeManuscript(input.bytes, input.encoding);
    if (!decoded.text.trim().length) throw new Error("MANUSCRIPT_EMPTY");
    const sourceHash = sha256(decoded.text);
    const rawHash = sha256(input.bytes);
     const prior = await prisma.manuscriptImportSession.findUnique({ where: { importRequestKey: input.requestKey }, include: { source: true } });
    if (prior) {
      if (prior.source.sourceHash !== sourceHash || prior.source.rawHash !== rawHash) throw new Error("REQUEST_KEY_CONFLICT");
      return { projectId: prior.projectId, sourceId: prior.sourceId, sessionId: prior.id, sourceHash, rawHash, encoding: decoded.encoding, charCount: decoded.text.length, byteCount: input.bytes.length, status: prior.status as "uploaded" };
    }
    const projectId = randomUUID();
    const sourceId = randomUUID();
    const sessionId = randomUUID();
     try { await prisma.$transaction(async tx => {
      await tx.manuscriptProject.create({ data: { id: projectId, narrativeForm: input.narrativeForm, activeSourceId: sourceId } });
      await tx.manuscriptSource.create({ data: { id: sourceId, projectId, version: 1, rawBytes: new Uint8Array(input.bytes), originalFileName: safeFileName(input.fileName), encoding: decoded.encoding, sourceText: decoded.text, sourceHash, rawHash, charCount: decoded.text.length } });
      await tx.manuscriptImportSession.create({ data: { id: sessionId, projectId, sourceId, status: "uploaded", importRequestKey: input.requestKey } });
    }); } catch(error) {
      if(error&&typeof error==="object"&&"code" in error&&error.code==="P2002")return this.create(input);
      throw error;
    }
    return { projectId, sourceId, sessionId, sourceHash, rawHash, encoding: decoded.encoding, charCount: decoded.text.length, byteCount: input.bytes.length, status: "uploaded" as const };
  }

  async get(sessionId: string) {
    const session = await prisma.manuscriptImportSession.findUnique({ where: { id: sessionId }, include: { source: true, project: true } });
    if (!session) throw new Error("MANUSCRIPT_NOT_FOUND");
    const units = parseUnits(session.splitDocumentJson);
    const coverage = units.length ? validateManuscriptPartition(session.source.sourceText, units) : null;
    return { id: sessionId, createdNovelId:session.createdNovelId, source:{id:session.source.id,sourceHash:session.source.sourceHash,rawHash:session.source.rawHash,encoding:session.source.encoding,charCount:session.source.charCount,byteCount:session.source.rawBytes.byteLength,version:session.source.version,originalFileName:session.source.originalFileName}, sessionId, projectId: session.projectId, sourceId: session.sourceId, sourceHash: session.source.sourceHash, rawHash: session.source.rawHash, encoding: session.source.encoding, charCount: session.source.charCount, byteCount: session.source.rawBytes.byteLength, version: session.version, status: session.status, units, coverage: coverage && { ...coverage, sourceLength: session.source.charCount, coveredLength: session.source.charCount, complete: true } };
  }

  async split(sessionId: string, expectedVersion: number, sourceHash: string, mode: "rules" | "manual") {
    const session = await prisma.manuscriptImportSession.findUnique({ where: { id: sessionId }, include: { source: true, project:true } });
    assertSession(session, expectedVersion, sourceHash);
    if (mode === "manual") return this.get(sessionId);
    const units = session.project.narrativeForm === "short_story"
      ? detectShortStoryPartition(session.source.sourceText)
      : detectRulePartition(session.source.sourceText);
    const result = validateManuscriptPartition(session.source.sourceText, units);
    const status = result.unresolvedCount ? "needs_review" : "ready_to_confirm";
    const updated = await prisma.manuscriptImportSession.updateMany({ where: { id: sessionId, version: expectedVersion, status: { not: "confirmed" } }, data: { version: { increment: 1 }, status, splitDocumentJson: JSON.stringify(units), coverageHash: result.coverageHash } });
    if (!updated.count) throw new Error("IMPORT_VERSION_CONFLICT");
    return this.get(sessionId);
  }

  async partition(sessionId: string, expectedVersion: number, sourceHash: string, units: ManuscriptPartitionUnit[]) {
    const session = await prisma.manuscriptImportSession.findUnique({ where: { id: sessionId }, include: { source: true, project:true } });
    assertSession(session, expectedVersion, sourceHash);
    const coverage = validateManuscriptPartition(session.source.sourceText, units);
    const unresolved = units.some(unit => unit.needsReview);
    const status = unresolved ? "needs_review" : "ready_to_confirm";
    const updated = await prisma.manuscriptImportSession.updateMany({ where: { id: sessionId, version: expectedVersion, status: { not: "confirmed" } }, data: { version: { increment: 1 }, status, splitDocumentJson: JSON.stringify(units), coverageHash: coverage.coverageHash } });
    if (!updated.count) throw new Error("IMPORT_VERSION_CONFLICT");
    return { ...(await this.get(sessionId)), status };
  }

  async confirm(sessionId: string, expectedVersion: number, sourceHash: string, coverageHash: string, title: string, requestKey: string) {
    if(!title.trim()||!requestKey.trim())throw Error("MANUSCRIPT_REQUEST_INVALID");
    const payloadHash = sha256(JSON.stringify({ expectedVersion, sourceHash, coverageHash, title: title.trim() }));
    return prisma.$transaction(async tx => {
       const session = await tx.manuscriptImportSession.findUnique({ where: { id: sessionId }, include: { source: true, project:true } });
      assertSession(session, expectedVersion, sourceHash);
      if (session.status === "confirmed" && session.createdNovelId) {
        if (session.confirmedRequestKey !== requestKey || session.confirmedPayloadHash !== payloadHash) throw new Error("IMPORT_ALREADY_CONFIRMED");
        return { projectId: session.projectId, novelId: session.createdNovelId, replayed: true };
      }
      const priorRequest = await tx.manuscriptImportSession.findFirst({ where: { confirmedRequestKey: requestKey } });
      if (priorRequest) {
        if (priorRequest.id !== sessionId || priorRequest.confirmedPayloadHash !== payloadHash) throw new Error("REQUEST_KEY_CONFLICT");
        if (priorRequest.createdNovelId) return { projectId: priorRequest.projectId, novelId: priorRequest.createdNovelId, replayed: true };
      }
      if (session.status !== "ready_to_confirm" || session.coverageHash !== coverageHash) throw new Error("PARTITION_INCOMPLETE");
      const units = parseUnits(session.splitDocumentJson).filter(unit => unit.role === "body");
      const checked = validateManuscriptPartition(session.source.sourceText, parseUnits(session.splitDocumentJson));
      if (checked.coverageHash !== coverageHash || checked.unresolvedCount) throw new Error("PARTITION_INCOMPLETE");
       const narrativeForm=session.project.narrativeForm as "long_novel"|"short_story";
       if(narrativeForm==="short_story"){
         const contents=units.map(unit=>session.source.sourceText.slice(unit.range.start,unit.range.end));
         const total=contents.reduce((sum,content)=>sum+content.replace(/\s+/gu,"").length,0);
         const novel=await tx.novel.create({data:{title:title.trim(),narrativeForm:"short_story",status:"draft",writingMode:"original"}});
         const plan=await tx.shortStoryPlan.create({data:{novelId:novel.id,status:"imported",targetWordCount:total,endingPromise:"",structureJson:JSON.stringify({title:title.trim(),targetWordCount:total,endingPromise:"",segments:contents.map((content,index)=>({order:index+1,purpose:"导入原稿分节",targetWordCount:content.replace(/\s+/gu,"").length}))})}});
         for(const [index,unit] of units.entries()){
           const content=contents[index]!;
            const segment=await tx.shortStorySegment.create({data:{planId:plan.id,novelId:novel.id,order:index+1,targetWordCount:content.replace(/\s+/gu,"").length,content,status:"completed",generatedAt:null}});
            await tx.manuscriptUnit.create({data:{id:randomUUID(),projectId:session.projectId,sourceId:session.sourceId,sourceRangesJson:JSON.stringify([unit.range]),originalTitle:unit.title,sourceOrdinal:index+1,workTargetType:"short_story_segment",segmentId:segment.id,displayOrder:index+1,status:"active",workingRevision:1,contentHash:sha256(content)}});
         }
         await tx.manuscriptProject.update({where:{id:session.projectId},data:{novelId:novel.id,status:"confirmed",structureVersion:1}});
         const updated=await tx.manuscriptImportSession.updateMany({where:{id:sessionId,version:expectedVersion,status:"ready_to_confirm"},data:{status:"confirmed",confirmedRequestKey:requestKey,confirmedPayloadHash:payloadHash,createdNovelId:novel.id}});
         if(!updated.count)throw new Error("IMPORT_VERSION_CONFLICT");
         return {projectId:session.projectId,novelId:novel.id,replayed:false,units:[]};
       }
       const novel = await tx.novel.create({ data: { title: title.trim(), narrativeForm: "long_novel", status: "draft", writingMode: "original", directorVersion: "v1", chapters: { create: units.map((unit, index) => ({ title: unit.title || `第${index + 1}章`, order: index + 1, content: session.source.sourceText.slice(unit.range.start, unit.range.end), generationState: "drafted" })) } }, include: { chapters: { orderBy: { order: "asc" } } } });
      const chapterByOrder = new Map(novel.chapters.map(chapter => [chapter.order, chapter]));
      for (const [index, unit] of units.entries()) await tx.manuscriptUnit.create({ data: { id: randomUUID(), projectId: session.projectId, sourceId: session.sourceId, sourceRangesJson: JSON.stringify([unit.range]), originalTitle: unit.title, sourceOrdinal: index + 1, workingRevision:1, displayOrder: index + 1, status: "active", chapterId: chapterByOrder.get(index + 1)!.id, contentHash: sha256(session.source.sourceText.slice(unit.range.start, unit.range.end)) } });
      await tx.manuscriptProject.update({ where: { id: session.projectId }, data: { novelId: novel.id, status: "confirmed", structureVersion: 1 } });
      const updated = await tx.manuscriptImportSession.updateMany({ where: { id: sessionId, version: expectedVersion, status: "ready_to_confirm" }, data: { status: "confirmed", confirmedRequestKey: requestKey, confirmedPayloadHash: payloadHash, createdNovelId: novel.id } });
      if (!updated.count) throw new Error("IMPORT_VERSION_CONFLICT");
      return { projectId: session.projectId, novelId: novel.id, replayed: false, units: novel.chapters.map(chapter => ({ chapterId: chapter.id, title: chapter.title, contentHash: sha256(chapter.content ?? "") })) };
    });
  }
}

function safeFileName(value?: string): string | undefined {
  if (!value) return undefined;
  return value.replace(/[\\/\u0000-\u001f]/gu, "_").slice(0, 180);
}
function parseUnits(value: string | null): ManuscriptPartitionUnit[] { return value ? JSON.parse(value) as ManuscriptPartitionUnit[] : []; }
function assertSession(session: { version: number; source: { sourceHash: string } } | null, version: number, sourceHash: string): asserts session {
  if (!session) throw new Error("MANUSCRIPT_NOT_FOUND");
  if (session.version !== version || session.source.sourceHash !== sourceHash) throw new Error("IMPORT_VERSION_CONFLICT");
}
