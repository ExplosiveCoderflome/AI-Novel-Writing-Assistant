import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { AppError } from "../../../../middleware/errorHandler";
import { createEmptyOutlineDocument, validateOutlineDocument, type OutlineDocument } from "../domain/outlineDocument";
import { OutlineRepository } from "../infrastructure/OutlineRepository";
import { diffOutlineDocuments } from "../domain/outlineDiff";

export class OutlineVersionConflict extends AppError {
  readonly code = "OUTLINE_VERSION_CONFLICT";
  constructor(message = "大纲已被其他操作更新，请重新加载后再保存") {
    super(message, 409);
    this.name = "OutlineVersionConflict";
  }
}

function countOutlineNodes(documentJson: string | null | undefined): { volumes: number; chapters: number } | null {
  if (!documentJson) return null;
  try {
    const parsed = JSON.parse(documentJson) as { volumes?: unknown[]; chapters?: unknown[] };
    if (!Array.isArray(parsed.volumes) || !Array.isArray(parsed.chapters)) return null;
    return { volumes: parsed.volumes.length, chapters: parsed.chapters.length };
  } catch {
    return null;
  }
}

export class OutlineProjectService {
  constructor(private readonly repository: OutlineRepository) {}
  async list() {
    const summaries = await this.repository.listSummaries();
    return summaries.map(({ project, revision }) => ({ ...project, outlineCounts: countOutlineNodes(revision?.documentJson) }));
  }
  archive(id: string) { return this.repository.archive(id); }
  async create(title = "未命名大纲") {
    const document = createEmptyOutlineDocument(title);
    const id = randomUUID();
    return this.repository.transaction(async tx => {
      const project = await tx.outlineProject.create({ data: { id, title, currentVersion: 1 } });
      const revision = await tx.outlineRevision.create({ data: { id: randomUUID(), projectId: id, version: 1, documentJson: JSON.stringify(document), sourceType: "manual" } });
      const updated = await tx.outlineProject.update({ where: { id: project.id }, data: { currentRevisionId: revision.id } });
      return { project: updated, revision, document };
    });
  }
  async get(id: string) {
    const result = await this.repository.getCurrent(id);
    if (!result) return null;
    return { ...result.project, document: result.revision ? validateOutlineDocument(JSON.parse(result.revision.documentJson)) : null };
  }
  async listRevisions(id: string) {
    const project = await this.repository.getCurrent(id);
    if (!project) throw new Error("大纲项目不存在");
    return this.repository.listRevisionRows(id);
  }
  async getRevision(id: string, revisionId: string) {
    const revision = await this.repository.findRevision(id, revisionId);
    return revision ? { ...revision, document: validateOutlineDocument(JSON.parse(revision.documentJson)) } : null;
  }
  async diff(id: string, fromVersion: number, toVersion: number) {
    const revisions = await this.repository.findRevisions(id, [fromVersion, toVersion]);
    const from = revisions.find(x => x.version === fromVersion), to = revisions.find(x => x.version === toVersion);
    if (!from || !to) throw new Error("找不到要比较的大纲修订");
    return diffOutlineDocuments(validateOutlineDocument(JSON.parse(from.documentJson)), validateOutlineDocument(JSON.parse(to.documentJson)));
  }
  async restore(id: string, revisionId: string, expectedVersion: number) {
    const target = await this.getRevision(id, revisionId);
    if (!target) throw new Error("大纲修订不存在");
    return this.save(id, expectedVersion, target.document, "restore");
  }
  async save(id: string, expectedVersion: number, input: unknown, sourceType = "manual") {
    let document: OutlineDocument;
    try {
      document = validateOutlineDocument(input);
    } catch (error) {
      if (error instanceof AppError || error instanceof ZodError) throw error;
      throw new AppError(error instanceof Error ? error.message : "大纲内容无法保存，请检查后重试。", 400);
    }
    return this.repository.transaction(async tx => {
      const project = await tx.outlineProject.findUnique({ where: { id } });
      if (!project) throw new AppError("大纲项目不存在", 404);
      if (project.currentVersion !== expectedVersion) throw new OutlineVersionConflict("大纲已被其他操作更新，请重新加载后再保存");
      const revision = await tx.outlineRevision.create({ data: { id: randomUUID(), projectId: id, version: expectedVersion + 1, parentRevisionId: project.currentRevisionId, documentJson: JSON.stringify(document), sourceType } });
      const result = await tx.outlineProject.updateMany({ where: { id, currentVersion: expectedVersion }, data: { currentVersion: expectedVersion + 1, currentRevisionId: revision.id, title: document.story.title } });
      if (result.count !== 1) throw new OutlineVersionConflict("大纲已被其他操作更新，请重新加载后再保存");
      return { revision, document };
    });
  }
}
