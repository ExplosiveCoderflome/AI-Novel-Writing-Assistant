import { randomUUID } from "node:crypto";
import { createEmptyOutlineDocument, validateOutlineDocument, type OutlineDocument } from "../domain/outlineDocument";
import { OutlineRepository } from "../infrastructure/OutlineRepository";

export class OutlineVersionConflict extends Error { readonly code = "OUTLINE_VERSION_CONFLICT"; }
export class OutlineProjectService {
  constructor(private readonly repository: OutlineRepository) {}
  list() { return this.repository.list(); }
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
  async save(id: string, expectedVersion: number, input: unknown, sourceType = "manual") {
    const document: OutlineDocument = validateOutlineDocument(input);
    return this.repository.transaction(async tx => {
      const project = await tx.outlineProject.findUnique({ where: { id } });
      if (!project) throw new Error("大纲项目不存在");
      if (project.currentVersion !== expectedVersion) throw new OutlineVersionConflict("大纲已被其他操作更新，请重新加载后再保存");
      const revision = await tx.outlineRevision.create({ data: { id: randomUUID(), projectId: id, version: expectedVersion + 1, parentRevisionId: project.currentRevisionId, documentJson: JSON.stringify(document), sourceType } });
      const result = await tx.outlineProject.updateMany({ where: { id, currentVersion: expectedVersion }, data: { currentVersion: expectedVersion + 1, currentRevisionId: revision.id, title: document.story.title } });
      if (result.count !== 1) throw new OutlineVersionConflict("大纲已被其他操作更新，请重新加载后再保存");
      return { revision, document };
    });
  }
}
