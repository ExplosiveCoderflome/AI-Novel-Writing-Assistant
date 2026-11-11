import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { outlineFeedbackSettingsSchema, outlineFeedbackOutputSchema, type OutlineFeedbackOutput, type OutlineFeedbackRunView, type OutlineFeedbackStatus, type OutlineFeedbackModelOptions, type OutlineFeedbackRunReceipt, type OutlineFeedbackDecisionResult } from "@ai-novel/shared/types/outlineFeedback";
import type { OutlineBookMapping, OutlineBookPolicy } from "@ai-novel/shared/types/outlineOpenBook";
import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";
import { validateOutlineDocument } from "../../domain/outlineDocument";
import { OutlineRepository } from "../../infrastructure/OutlineRepository";
import { OutlineProposalService } from "../../application/OutlineProposalService";
import { applyOutlinePolicy } from "../../openBook/domain/policy";
import { outlineHash } from "../../openBook/domain/mapping";
import { AppError } from "../../../../../middleware/errorHandler";
import { outlineFeedbackPrompt, type OutlineFeedbackPromptInput } from "../../../../../prompting/prompts/outline/feedback.prompts";
import { runStructuredPrompt } from "../../../../../prompting/core/promptRunner";
import { withoutRequiredPromptContext } from "../../../../../prompting/core/requiredContext";
import { feedbackDue, feedbackNodes } from "../domain/feedbackPolicy";

type Item = OutlineFeedbackRunView["items"][number];
interface Snapshot { prompt: OutlineFeedbackPromptInput; baseVersion: number; policyVersion: number; revisionId: string; workspaceId: string | null; workspaceHash: string | null; options: OutlineFeedbackModelOptions }
type Db = Prisma.TransactionClient;
type Analyzer = (input: OutlineFeedbackPromptInput, options: OutlineFeedbackModelOptions) => Promise<OutlineFeedbackOutput>;
const conflict = (text: string) => new AppError(text, 409);
const receipt = (run: {id: string; status: string; chapterId: string; chapterOrder: number}): OutlineFeedbackRunReceipt => ({id: run.id, status: run.status as OutlineFeedbackRunReceipt["status"], chapterId: run.chapterId, chapterOrder: run.chapterOrder});

export class OutlineFeedbackService {
  constructor(private readonly db: PrismaClient, private readonly analyze: Analyzer = async (promptInput, options) =>
    (await withoutRequiredPromptContext(() => runStructuredPrompt({asset: outlineFeedbackPrompt, promptInput, options: {...options, maxTokens: 3500, temperature: 0.3, timeoutMs: 120000}}))).output,
    private readonly dispatch: (work: () => Promise<void>) => void = work => { setImmediate(() => { void work().catch(() => {}); }); }) {}

  private async binding(db: Db, projectId: string) {
    const b = await db.outlineBookBinding.findUnique({where: {projectId}});
    if (!b || await db.manuscriptProject.findFirst({where: {OR: [{novelId: b.novelId}, {workingOutlineProjectId: projectId}]}, select: {id: true}})) throw conflict("仅大纲开书作品可使用章节反馈。");
    return b;
  }
  async status(projectId: string): Promise<OutlineFeedbackStatus> {
    const b = await this.binding(this.db, projectId);
    const runs = await this.db.outlineFeedbackRun.findMany({where: {projectId}, orderBy: {createdAt: "desc"}, take: 50});
    return {projectId, novelId: b.novelId, sourceRoute: `/outlines/${projectId}`, settings: outlineFeedbackSettingsSchema.parse(JSON.parse(b.feedbackSettingsJson)),
      runs: runs.map(r => ({id: r.id, chapterId: r.chapterId, chapterOrder: r.chapterOrder, status: r.status as OutlineFeedbackRunView["status"], error: r.error, attempt: r.attempt, createdAt: r.createdAt.toISOString(), items: JSON.parse(r.itemsJson)}))};
  }
  async settings(projectId: string, raw: unknown) {
    const settings = outlineFeedbackSettingsSchema.parse(raw);
    const b = await this.binding(this.db, projectId);
    await this.db.outlineBookBinding.update({where: {id: b.id}, data: {feedbackSettingsJson: JSON.stringify(settings)}});
    return settings;
  }
  /** Fire-and-forget after summary commit. No text or generation context crosses this boundary. */
  notify(novelId: string, chapterId: string): void {
    this.dispatch(async () => {
      const b = await this.db.outlineBookBinding.findUnique({where: {novelId}});
      if (!b || await this.db.manuscriptProject.findUnique({where: {novelId}, select: {id: true}})) return;
      await this.enqueue(b.projectId, chapterId, undefined, true);
    });
  }
  async enqueue(projectId: string, chapterId: string, requestKey?: string, automatic = false): Promise<OutlineFeedbackRunReceipt | null> {
    const b = await this.binding(this.db, projectId);
    const settings = outlineFeedbackSettingsSchema.parse(JSON.parse(b.feedbackSettingsJson));
    const chapter = await this.db.chapter.findFirst({where: {id: chapterId, novelId: b.novelId}, select: {id: true, order: true, chapterSummary: {select: {summary: true}}}});
    if (!chapter?.chapterSummary?.summary.trim()) throw conflict("请先保存本章摘要。");
    const mapping: OutlineBookMapping = JSON.parse(b.mappingJson);
    if (automatic && !feedbackDue(settings, chapter.order, mapping)) return null;
    const key = createHash("sha256").update(`${projectId}:${requestKey ?? `auto:${chapterId}:${chapter.chapterSummary.summary}`}`).digest("hex");
    const prior = await this.db.outlineFeedbackRun.findUnique({where: {requestKey: key}});
    if (prior) { if (prior.status === "pending") this.schedule(prior.id); return receipt(prior); }
    const current = await new OutlineRepository(this.db).getCurrent(projectId);
    if (!current?.revision) throw conflict("找不到工作大纲。");
    const workspace = await this.db.volumePlanVersion.findFirst({where: {novelId: b.novelId, status: "active"}, orderBy: {version: "desc"}});
    const document = applyOutlinePolicy(validateOutlineDocument(JSON.parse(current.revision.documentJson)), JSON.parse(b.policyJson));
    const snapshot: Snapshot = {baseVersion: current.project.currentVersion, policyVersion: b.policyVersion, revisionId: b.revisionId,
      workspaceId: workspace?.id ?? null, workspaceHash: workspace ? outlineHash(JSON.parse(workspace.contentJson)) : null,
      prompt: {summary: chapter.chapterSummary.summary.slice(0, 3000), chapterOrder: chapter.order, nodes: feedbackNodes(document, mapping, JSON.parse(b.policyJson), chapter.order)},
      options: {provider: settings.provider as OutlineFeedbackModelOptions["provider"], model: settings.model}};
    const run = await this.db.outlineFeedbackRun.upsert({where: {requestKey: key}, update: {}, create: {id: randomUUID(), projectId, novelId: b.novelId, chapterId, chapterOrder: chapter.order, requestKey: key, inputJson: JSON.stringify(snapshot)}});
    this.schedule(run.id);
    return receipt(run);
  }
  private schedule(id: string) { this.dispatch(() => this.execute(id)); }
  async execute(id: string) {
    const claim = await this.db.outlineFeedbackRun.updateMany({where: {id, status: "pending"}, data: {status: "running", attempt: {increment: 1}, error: null}});
    if (!claim.count) return;
    const claimed = await this.db.outlineFeedbackRun.findUniqueOrThrow({where: {id}});
    try {
      const run = await this.db.outlineFeedbackRun.findUniqueOrThrow({where: {id}});
      await this.binding(this.db, run.projectId);
      const snapshot: Snapshot = JSON.parse(run.inputJson);
      const output = outlineFeedbackOutputSchema.parse(snapshot.prompt.nodes.length ? await this.analyze(snapshot.prompt, snapshot.options) : {operations: []});
      const seen = new Set<string>();
      const fields = new Set<string>();
      for (const op of output.operations) {
        const node = snapshot.prompt.nodes.find(n => n.nodeId === op.nodeId);
        if (seen.has(op.operationId) || !node || !Object.keys(op.fields).length || Object.keys(op.fields).some(f => !(f in node.fields))) throw conflict("反馈包含重复操作或越界字段，请重试分析。");
        seen.add(op.operationId);
        for (const field of Object.keys(op.fields)) {
          const key = `${op.nodeId}:${field}`;
          if (fields.has(key)) throw conflict("同一字段存在重复建议，请重试分析。");
          fields.add(key);
        }
      }
      await this.db.$transaction(async tx => {
        const active = await tx.outlineFeedbackRun.updateMany({where: {id, status: "running", attempt: claimed.attempt}, data: {updatedAt: new Date()}});
        if (!active.count) return;
        const items: Item[] = [];
        for (const op of output.operations) {
          const proposalId = randomUUID();
          await tx.outlineProposal.create({data: {id: proposalId, projectId: run.projectId, baseVersion: snapshot.baseVersion, kind: "text_feedback", status: "pending", proposalJson: JSON.stringify({operations: [op]}), promptId: outlineFeedbackPrompt.id, promptVersion: outlineFeedbackPrompt.version}});
          items.push({...op, proposalId, status: "pending"});
        }
        await tx.outlineFeedbackRun.update({where: {id}, data: {status: "completed", itemsJson: JSON.stringify(items)}});
      });
    } catch {
      await this.db.outlineFeedbackRun.updateMany({where: {id, status: "running", attempt: claimed.attempt}, data: {status: "failed", error: "章节反馈分析未完成，请重试。"}});
    }
  }
  async retry(projectId: string, id: string) {
    await this.binding(this.db, projectId);
    // A crashed in-process worker is reclaimable after its bounded model timeout window.
    const changed = await this.db.outlineFeedbackRun.updateMany({where: {id, projectId, OR: [{status: "failed"}, {status: "running", updatedAt: {lt: new Date(Date.now()-10*60_000)}}]}, data: {status: "pending", error: null}});
    const run = await this.db.outlineFeedbackRun.findFirst({where: {id, projectId}});
    if (!run || !changed.count && run.status !== "pending") throw conflict("此分析不能重试。");
    this.schedule(id); return {id, status: "pending"};
  }
  async decide(projectId: string, id: string, operationIds: string[], decision: "adopted" | "rejected"): Promise<OutlineFeedbackDecisionResult> {
    return this.db.$transaction(async tx => {
      const b = await this.binding(tx, projectId);
      const run = await tx.outlineFeedbackRun.findFirst({where: {id, projectId, status: "completed"}});
      if (!run) throw conflict("找不到已完成的反馈。");
      const items: Item[] = JSON.parse(run.itemsJson), snapshot: Snapshot = JSON.parse(run.inputJson);
      const selected = [...new Set(operationIds)].map(key => {
        const item = items.find(i => i.operationId === key);
        if (!item || item.status !== "pending" && item.status !== decision) throw conflict("建议已处理或不存在。");
        return item;
      }).filter(i => i.status === "pending");
      if (!selected.length) return {id, items};
      // Serialize decisions on this run, including rejection-only requests.
      const lock = await tx.outlineFeedbackRun.updateMany({where: {id, itemsJson: run.itemsJson}, data: {updatedAt: new Date()}});
      if (!lock.count) throw conflict("反馈已变化，请刷新。");
      if (decision === "adopted") {
        const sourceSummary = await tx.chapterSummary.findUnique({where: {chapterId: run.chapterId}, select: {summary: true}});
        if (sourceSummary?.summary.slice(0, 3000) !== snapshot.prompt.summary) throw conflict("本章摘要已变化，请重新分析。");
        if (b.policyVersion !== snapshot.policyVersion || b.revisionId !== snapshot.revisionId) throw conflict("大纲策略已变化，请重新分析。");
        const repository = new OutlineRepository(tx as PrismaClient, true);
        const current = await repository.getCurrent(projectId);
        if (!current?.revision || current.project.currentVersion !== snapshot.baseVersion) throw conflict("工作大纲已变化，请重新分析。");
        const mapping: OutlineBookMapping = JSON.parse(b.mappingJson), policy: OutlineBookPolicy = JSON.parse(b.policyJson);
        const document = applyOutlinePolicy(validateOutlineDocument(JSON.parse(current.revision.documentJson)), policy);
        const allowed = feedbackNodes(document, mapping, policy, run.chapterOrder);
        const latestWritten = await tx.chapter.findFirst({where: {novelId: b.novelId, OR: [{content: {not: ""}}, {generationState: {not: "planned"}}]}, orderBy: {order: "desc"}, select: {order: true}});
        const workspace = await tx.volumePlanVersion.findFirst({where: {novelId: b.novelId, status: "active"}, orderBy: {version: "desc"}});
        if (!workspace || workspace.id !== snapshot.workspaceId || outlineHash(JSON.parse(workspace.contentJson)) !== snapshot.workspaceHash) throw conflict("章节规划已变化，请重新分析。");
        const working: VolumePlanDocument = JSON.parse(workspace.contentJson);
        let version = snapshot.baseVersion;
        for (const item of selected) {
          const node = allowed.find(n => n.nodeId === item.nodeId);
          if (!node || Object.keys(item.fields).some(f => !(f in node.fields))) throw conflict("目标字段已锁定或不在反馈范围内。");
          const mapped = mapping.chapters.find(c => c.nodeId === item.nodeId);
          if (mapped && mapped.chapterOrder <= Math.max(run.chapterOrder, latestWritten?.order ?? 0)) throw conflict("不能修改已写作或当前章节。");
          await tx.outlineProposal.update({where: {id: item.proposalId}, data: {baseVersion: version}});
          await new OutlineProposalService(repository).apply(projectId, item.proposalId, [item.operationId], true);
          version++;
          for (const [field,value] of Object.entries(item.fields)) policy.rules.find(r => r.nodeId === item.nodeId && r.field === field)!.value = value;
          const relatedChapterIds = new Set([
            ...document.chapters.filter(c => c.characterNodeIds.includes(item.nodeId) || c.payoffNodeIds.includes(item.nodeId)).map(c => c.nodeId),
            ...(document.characters.find(c => c.nodeId === item.nodeId)?.appearanceNodeIds ?? []),
            ...(document.payoffs.find(p => p.nodeId === item.nodeId)?.setupChapterNodeIds ?? []),
            ...(document.payoffs.find(p => p.nodeId === item.nodeId)?.payoffChapterNodeIds ?? []),
          ]);
          const affected = mapped ? [mapped] : mapping.chapters.filter(c => c.chapterOrder > Math.max(run.chapterOrder, latestWritten?.order ?? 0) && relatedChapterIds.has(c.nodeId));
          for (const target of affected) {
            const chapter = working.volumes.flatMap(v => v.chapters).find(c => c.id === target.planId && c.chapterId === target.chapterId);
            if (!chapter) throw conflict("后续章纲映射不完整。");
            // Invalidate execution details so A2 rebuilds them from the accepted source fields.
            if (mapped) Object.assign(chapter, item.fields);
            chapter.taskSheet = null; chapter.sceneCards = null;
            await tx.volumeChapterPlan.update({where: {id: target.planId}, data: {summary: chapter.summary, purpose: chapter.purpose, taskSheet: null, sceneCards: null}});
            const saved = await tx.chapter.updateMany({where: {id: target.chapterId, generationState: "planned", AND: [
              {OR: [{content: ""}, {content: null}]}, {OR: [{chapterStatus: {not: "generating"}}, {chapterStatus: null}]},
            ]}, data: {expectation: chapter.summary, taskSheet: null, sceneCards: null}});
            if (!saved.count) throw conflict("后续章节已开始写作，请重新分析。");
            await tx.storyPlan.updateMany({where: {novelId: b.novelId, chapterId: target.chapterId, level: "chapter"}, data: {status: "stale"}});
          }
          item.status = decision;
        }
        const changed = await tx.outlineBookBinding.updateMany({where: {id: b.id, policyVersion: snapshot.policyVersion}, data: {policyJson: JSON.stringify(policy), policyVersion: {increment: 1}}});
        if (!changed.count) throw conflict("大纲策略已变化。");
        const savedWorkspace = await tx.volumePlanVersion.updateMany({where: {id: workspace.id, contentJson: workspace.contentJson}, data: {contentJson: JSON.stringify(working)}});
        if (!savedWorkspace.count) throw conflict("章节规划已变化，请重新分析。");
        snapshot.baseVersion = version; snapshot.policyVersion++;
        snapshot.workspaceHash = outlineHash(working);
        // Remaining independent items can be reviewed against the newly accepted version.
      } else {
        for (const item of selected) { await tx.outlineProposal.update({where: {id: item.proposalId}, data: {status: "rejected"}}); item.status = decision; }
      }
      await tx.outlineFeedbackRun.update({where: {id}, data: {itemsJson: JSON.stringify(items), inputJson: JSON.stringify(snapshot)}});
      return {id, items};
    });
  }
}
