import type { PrismaClient, OutlineBookBinding } from "@prisma/client";
import { outlineOpenBookConfirmSchema, outlineOpenBookInputSchema, type OutlineBookBindingView, type OutlineOpenBookPreview } from "@ai-novel/shared/types/outlineOpenBook";
import { mapOutlineBook } from "../domain/mapping";
import { buildOutlineWorkspace } from "../domain/assets";
import { OutlineOpenBookError } from "../domain/errors";
import { NovelCoreCrudService } from "../../../../../services/novel/novelCoreCrudService";
import { persistActiveVolumeWorkspace } from "../../../../../services/novel/volume/volumeWorkspacePersistence";
import { queueRagUpsert } from "../../../../../services/novel/novelCoreSupport";
import { withSqliteRetry } from "../../../../../db/sqliteRetry";

export class OutlineOpenBookService {
  constructor(private readonly db: PrismaClient, private readonly setup: (novelId: string) => Promise<void> = async id => { queueRagUpsert("novel", id); }) {}
  private async source(projectId: string, revisionId: string) {
    const project = await this.db.outlineProject.findUnique({where: {id: projectId}});
    const revision = await this.db.outlineRevision.findFirst({where: {id: revisionId, projectId}});
    if (!project || !revision) throw new OutlineOpenBookError("OUTLINE_REVISION_NOT_FOUND", "找不到这份大纲修订，请重新选择版本。", 404);
    return {project, revision};
  }
  private mapped(documentJson: string, raw: unknown, projectId: string) {
    const input = outlineOpenBookInputSchema.parse(raw);
    try { return mapOutlineBook(JSON.parse(documentJson), input, `outline-book-${projectId}`); }
    catch (error) { throw new OutlineOpenBookError("OUTLINE_OPEN_INVALID", error instanceof Error ? error.message : "大纲结构无效", 422); }
  }
  async preview(projectId: string, raw: unknown): Promise<OutlineOpenBookPreview> {
    const input = outlineOpenBookInputSchema.parse(raw);
    const {project, revision} = await this.source(projectId, input.revisionId);
    if (project.currentVersion !== input.expectedProjectVersion) throw new OutlineOpenBookError("OUTLINE_VERSION_CONFLICT", "大纲有新修订，请确认来源版本后重试。");
    const result = this.mapped(revision.documentJson, input, projectId);
    return {revisionId: revision.id, revisionVersion: revision.version, currentVersion: project.currentVersion,
      sourceDocumentHash: result.sourceDocumentHash, requestHash: result.requestHash, mapping: result.mapping,
      policy: result.policy, settings: result.settings, warnings: [...result.warnings, ...(revision.version !== project.currentVersion ? ["将采用历史修订，不会自动跟随新版本。"] : [])],
      counts: {volumes: result.document.volumes.length, chapters: result.document.chapters.length, characters: result.document.characters.length, payoffs: result.document.payoffs.length}};
  }
  async getBinding(projectId: string): Promise<OutlineBookBindingView | null> {
    const binding = await this.db.outlineBookBinding.findUnique({where: {projectId}});
    const project = await this.db.outlineProject.findUnique({where: {id: projectId}});
    if (!project) throw new OutlineOpenBookError("OUTLINE_NOT_FOUND", "大纲项目不存在。", 404);
    if (!binding) {
      if (project.boundNovelId) throw new OutlineOpenBookError("OUTLINE_BINDING_INTEGRITY", "大纲与小说的绑定记录不完整，请检查来源。", 409);
      return null;
    }
    const novel = await this.db.novel.findUnique({where: {id: binding.novelId}});
    if (!novel || project.boundNovelId !== novel.id) throw new OutlineOpenBookError("OUTLINE_BINDING_INTEGRITY", "找不到绑定小说或来源不一致，不能重复开书。", 409);
    return {bindingId: binding.id, projectId, novelId: novel.id, title: novel.title, revisionId: binding.revisionId,
      revisionVersion: binding.revisionVersion, currentVersion: project.currentVersion, sourceDocumentHash: binding.sourceDocumentHash,
      policyVersion: binding.policyVersion, sourceRoute: `/lab/director/${encodeURIComponent(novel.id)}`,
      mapping: JSON.parse(binding.mappingJson), policy: JSON.parse(binding.policyJson), setupState: JSON.parse(binding.postCreateStateJson)};
  }
  private checkReplay(binding: OutlineBookBinding, key: string, hash: string) {
    if (binding.requestKey !== key) throw new OutlineOpenBookError("OUTLINE_ALREADY_BOUND", "这份大纲已绑定小说，请继续这本书。", 409, {sourceRoute: `/lab/director/${encodeURIComponent(binding.novelId)}`});
    if (binding.requestHash !== hash) throw new OutlineOpenBookError("OUTLINE_OPEN_REQUEST_CONFLICT", "相同请求标识的开书设置不同，请重新预览。");
  }
  async confirm(projectId: string, raw: unknown) {
    const input = outlineOpenBookConfirmSchema.parse(raw);
    const {revision} = await this.source(projectId, input.revisionId);
    const result = this.mapped(revision.documentJson, input, projectId);
    if (input.requestHash !== result.requestHash) throw new OutlineOpenBookError("OUTLINE_PREVIEW_STALE", "开书设置已变化，请重新预览确认。");
    let replayed = false;
    try {
      await withSqliteRetry(() => this.db.$transaction(async tx => {
        const byKey = await tx.outlineBookBinding.findUnique({where: {requestKey: input.idempotencyKey}});
        if (byKey && byKey.projectId !== projectId) throw new OutlineOpenBookError("OUTLINE_OPEN_REQUEST_CONFLICT", "此请求标识属于另一份大纲。");
        const existing = byKey ?? await tx.outlineBookBinding.findUnique({where: {projectId}});
        if (existing) { this.checkReplay(existing, input.idempotencyKey, result.requestHash); replayed = true; return; }
        const project = await tx.outlineProject.findUniqueOrThrow({where: {id: projectId}});
        if (project.boundNovelId) throw new OutlineOpenBookError("OUTLINE_BINDING_INTEGRITY", "大纲已有小说来源记录，不能重复开书。");
        if (project.status !== "active") throw new OutlineOpenBookError("OUTLINE_ARCHIVED", "请恢复大纲项目后再开书。");
        if (project.currentVersion !== input.expectedProjectVersion) throw new OutlineOpenBookError("OUTLINE_VERSION_CONFLICT", "大纲有新修订，请确认来源版本后重试。");
        const currentRevision = await tx.outlineRevision.findFirstOrThrow({where: {id: revision.id, projectId}});
        if (currentRevision.documentJson !== revision.documentJson) throw new OutlineOpenBookError("OUTLINE_SOURCE_CHANGED", "大纲来源发生变化，请重新预览。");
        const bindingId = `outline-book-${projectId}`, novelId = `outline-novel-${projectId}`, versionId = `outline-volume-${projectId}`;
        const reserved = await tx.outlineProject.updateMany({where: {id: projectId, boundNovelId: null, currentVersion: input.expectedProjectVersion}, data: {boundNovelId: novelId}});
        if (reserved.count !== 1) throw new OutlineOpenBookError("OUTLINE_VERSION_CONFLICT", "大纲绑定已变化，请重新打开。");
        const story = result.document.story;
        await new NovelCoreCrudService().createNovel({id: novelId, ...result.settings,
          description: story.synopsis || story.premise, targetAudience: story.targetAudience,
          styleTone: story.tone, writingMode: "original", narrativeForm: "long_novel", directorVersion: "v2"}, tx);
        for (const mapped of result.mapping.characters) {
          const c = result.document.characters.find(c => c.nodeId === mapped.nodeId)!;
          await tx.character.create({data: {id: mapped.characterId, novelId, name: c.name, role: c.role || "未标注", gender: "unknown", outerGoal: c.goal, secret: c.secret, development: c.arcDirection}});
        }
        for (const mapped of result.mapping.chapters) {
          const c = result.document.chapters.find(c => c.nodeId === mapped.nodeId)!;
          await tx.chapter.create({data: {id: mapped.chapterId, novelId, order: mapped.chapterOrder, title: c.title || `第${mapped.chapterOrder}章`, expectation: c.summary, content: "", targetWordCount: result.settings.defaultChapterLength}});
        }
        const workspace = buildOutlineWorkspace(novelId, result.document, result.mapping, result.settings.defaultChapterLength, versionId);
        await tx.volumePlanVersion.create({data: {id: versionId, novelId, version: 1, status: "active", contentJson: JSON.stringify(workspace)}});
        await persistActiveVolumeWorkspace(tx, novelId, workspace, versionId);
        await tx.outlineBookBinding.create({data: {id: bindingId, projectId, revisionId: revision.id, revisionVersion: revision.version,
          novelId, sourceDocumentHash: result.sourceDocumentHash, requestKey: input.idempotencyKey, requestHash: result.requestHash,
          mappingJson: JSON.stringify(result.mapping), policyJson: JSON.stringify(result.policy), postCreateStateJson: JSON.stringify({rag: "pending"})}});
      }), {label: "outline-open-book"});
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        const existing = await this.db.outlineBookBinding.findUnique({where: {projectId}});
        if (!existing) throw error;
        this.checkReplay(existing, input.idempotencyKey, result.requestHash); replayed = true;
      } else throw error;
    }
    let binding = await this.getBinding(projectId);
    if (binding?.setupState.rag === "pending") binding = await this.retrySetup(projectId);
    return {...binding!, replayed};
  }
  async retrySetup(projectId: string, expectedPolicyVersion?: number) {
    const binding = await this.getBinding(projectId);
    if (!binding) throw new OutlineOpenBookError("OUTLINE_BINDING_NOT_FOUND", "这份大纲尚未开书。", 404);
    if (expectedPolicyVersion !== undefined && binding.policyVersion !== expectedPolicyVersion) throw new OutlineOpenBookError("OUTLINE_POLICY_CONFLICT", "保留策略已变化，请刷新后重试。");
    if (binding.setupState.rag === "queued") return binding;
    let state: OutlineBookBindingView["setupState"];
    try { await this.setup(binding.novelId); state = {rag: "queued"}; }
    catch { state = {rag: "pending", error: "索引安排未完成，可以重试；小说已保存。"}; }
    await this.db.outlineBookBinding.update({where: {id: binding.bindingId}, data: {postCreateStateJson: JSON.stringify(state)}});
    return {...binding, setupState: state};
  }
}
