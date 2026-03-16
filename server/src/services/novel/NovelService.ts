import { NovelPipelineService } from "./NovelPipelineService";
import { NovelCoreService } from "./NovelCoreService";

export class NovelService extends NovelPipelineService {
  getNovelState(...args: Parameters<NovelCoreService["getNovelState"]>) {
    return this.core.getNovelState(...args);
  }

  getLatestStateSnapshot(...args: Parameters<NovelCoreService["getLatestStateSnapshot"]>) {
    return this.core.getLatestStateSnapshot(...args);
  }

  getChapterStateSnapshot(...args: Parameters<NovelCoreService["getChapterStateSnapshot"]>) {
    return this.core.getChapterStateSnapshot(...args);
  }

  rebuildNovelState(...args: Parameters<NovelCoreService["rebuildNovelState"]>) {
    return this.core.rebuildNovelState(...args);
  }

  generateBookPlan(...args: Parameters<NovelCoreService["generateBookPlan"]>) {
    return this.core.generateBookPlan(...args);
  }

  generateArcPlan(...args: Parameters<NovelCoreService["generateArcPlan"]>) {
    return this.core.generateArcPlan(...args);
  }

  generateChapterPlan(...args: Parameters<NovelCoreService["generateChapterPlan"]>) {
    return this.core.generateChapterPlan(...args);
  }

  getChapterPlan(...args: Parameters<NovelCoreService["getChapterPlan"]>) {
    return this.core.getChapterPlan(...args);
  }

  replanNovel(...args: Parameters<NovelCoreService["replanNovel"]>) {
    return this.core.replanNovel(...args);
  }

  auditChapter(...args: Parameters<NovelCoreService["auditChapter"]>) {
    return this.core.auditChapter(...args);
  }

  listChapterAuditReports(...args: Parameters<NovelCoreService["listChapterAuditReports"]>) {
    return this.core.listChapterAuditReports(...args);
  }

  resolveAuditIssues(...args: Parameters<NovelCoreService["resolveAuditIssues"]>) {
    return this.core.resolveAuditIssues(...args);
  }
}
