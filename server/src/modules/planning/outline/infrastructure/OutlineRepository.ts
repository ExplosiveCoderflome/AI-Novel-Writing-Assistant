import type { PrismaClient } from "@prisma/client";

export class OutlineRepository {
  constructor(private readonly db: PrismaClient) {}
  list() { return this.db.outlineProject.findMany({ where: { status: "active" }, orderBy: { updatedAt: "desc" } }); }
  get(id: string) { return this.db.outlineProject.findUnique({ where: { id } }); }
  async getCurrent(id: string) {
    const project = await this.db.outlineProject.findUnique({ where: { id } });
    if (!project) return null;
    const revision = project.currentRevisionId ? await this.db.outlineRevision.findUnique({ where: { id: project.currentRevisionId } }) : null;
    return { project, revision };
  }
  create(data: Parameters<PrismaClient["outlineProject"]["create"]>[0]) { return this.db.outlineProject.create(data); }
  transaction<T>(run: (tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">) => Promise<T>) { return this.db.$transaction(run); }
}
