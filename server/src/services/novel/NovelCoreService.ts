import {
  ChapterGenerateOptions,
  ChapterInput,
  CharacterInput,
  CharacterTimelineSyncOptions,
  CreateNovelInput,
  GenerateBeatOptions,
  HookGenerateOptions,
  LLMGenerateOptions,
  OutlineGenerateOptions,
  PaginationInput,
  PipelineRunOptions,
  RepairOptions,
  ReviewOptions,
  StorylineDraftInput,
  StorylineImpactInput,
  StructuredOutlineGenerateOptions,
  TitleGenerateOptions,
  UpdateNovelInput,
} from "./novelCoreShared";
import { NovelCoreCharacterService } from "./novelCoreCharacterService";
import { NovelCoreCrudService } from "./novelCoreCrudService";
import { NovelCoreGenerationService } from "./novelCoreGenerationService";
import { NovelCorePipelineService } from "./novelCorePipelineService";
import { NovelCoreReviewService } from "./novelCoreReviewService";
import { NovelCoreSnapshotService } from "./novelCoreSnapshotService";
import { NovelCoreStorylineService } from "./novelCoreStorylineService";

export class NovelCoreService {
  private readonly crudService = new NovelCoreCrudService();
  private readonly storylineService = new NovelCoreStorylineService();
  private readonly characterService = new NovelCoreCharacterService();
  private readonly generationService = new NovelCoreGenerationService();
  private readonly reviewService = new NovelCoreReviewService();
  private readonly pipelineService = new NovelCorePipelineService();
  private readonly snapshotService = new NovelCoreSnapshotService();

  async listNovels(input: PaginationInput) {
    return this.crudService.listNovels(input);
  }

  async createNovel(input: CreateNovelInput) {
    return this.crudService.createNovel(input);
  }

  async getNovelById(id: string) {
    return this.crudService.getNovelById(id);
  }

  async listStorylineVersions(novelId: string) {
    return this.storylineService.listStorylineVersions(novelId);
  }

  async createStorylineDraft(novelId: string, input: StorylineDraftInput) {
    return this.storylineService.createStorylineDraft(novelId, input);
  }

  async activateStorylineVersion(novelId: string, versionId: string) {
    return this.storylineService.activateStorylineVersion(novelId, versionId);
  }

  async freezeStorylineVersion(novelId: string, versionId: string) {
    return this.storylineService.freezeStorylineVersion(novelId, versionId);
  }

  async getStorylineDiff(novelId: string, versionId: string, compareVersion?: number) {
    return this.storylineService.getStorylineDiff(novelId, versionId, compareVersion);
  }

  async analyzeStorylineImpact(novelId: string, input: StorylineImpactInput) {
    return this.storylineService.analyzeStorylineImpact(novelId, input);
  }

  async updateNovel(id: string, input: UpdateNovelInput) {
    return this.crudService.updateNovel(id, input);
  }

  async deleteNovel(id: string) {
    return this.crudService.deleteNovel(id);
  }

  async listChapters(novelId: string) {
    return this.crudService.listChapters(novelId);
  }

  async createChapter(novelId: string, input: ChapterInput) {
    return this.crudService.createChapter(novelId, input);
  }

  async updateChapter(novelId: string, chapterId: string, input: Partial<ChapterInput>) {
    return this.crudService.updateChapter(novelId, chapterId, input);
  }

  async deleteChapter(novelId: string, chapterId: string) {
    return this.crudService.deleteChapter(novelId, chapterId);
  }

  async listCharacters(novelId: string) {
    return this.characterService.listCharacters(novelId);
  }

  async createCharacter(novelId: string, input: CharacterInput) {
    return this.characterService.createCharacter(novelId, input);
  }

  async updateCharacter(novelId: string, characterId: string, input: Partial<CharacterInput>) {
    return this.characterService.updateCharacter(novelId, characterId, input);
  }

  async deleteCharacter(novelId: string, characterId: string) {
    return this.characterService.deleteCharacter(novelId, characterId);
  }

  async listCharacterTimeline(novelId: string, characterId: string) {
    return this.characterService.listCharacterTimeline(novelId, characterId);
  }

  async syncCharacterTimeline(
    novelId: string,
    characterId: string,
    options: CharacterTimelineSyncOptions = {},
  ) {
    return this.characterService.syncCharacterTimeline(novelId, characterId, options);
  }

  async syncAllCharacterTimeline(novelId: string, options: CharacterTimelineSyncOptions = {}) {
    return this.characterService.syncAllCharacterTimeline(novelId, options);
  }

  async evolveCharacter(novelId: string, characterId: string, options: LLMGenerateOptions = {}) {
    return this.characterService.evolveCharacter(novelId, characterId, options);
  }

  async checkCharacterAgainstWorld(novelId: string, characterId: string, options: LLMGenerateOptions = {}) {
    return this.characterService.checkCharacterAgainstWorld(novelId, characterId, options);
  }

  async createOutlineStream(novelId: string, options: OutlineGenerateOptions = {}) {
    return this.generationService.createOutlineStream(novelId, options);
  }

  async createStructuredOutlineStream(novelId: string, options: StructuredOutlineGenerateOptions = {}) {
    return this.generationService.createStructuredOutlineStream(novelId, options);
  }

  async createChapterStream(novelId: string, chapterId: string, options: ChapterGenerateOptions = {}) {
    return this.generationService.createChapterStream(novelId, chapterId, options);
  }

  async generateTitles(novelId: string, options: TitleGenerateOptions = {}) {
    return this.generationService.generateTitles(novelId, options);
  }

  async createBibleStream(novelId: string, options: LLMGenerateOptions = {}) {
    return this.generationService.createBibleStream(novelId, options);
  }

  async createBeatStream(novelId: string, options: GenerateBeatOptions = {}) {
    return this.generationService.createBeatStream(novelId, options);
  }

  async startPipelineJob(novelId: string, options: PipelineRunOptions) {
    return this.pipelineService.startPipelineJob(novelId, options);
  }

  async getPipelineJob(novelId: string, jobId: string) {
    return this.pipelineService.getPipelineJob(novelId, jobId);
  }

  async getPipelineJobById(jobId: string) {
    return this.pipelineService.getPipelineJobById(jobId);
  }

  async findActivePipelineJobForRange(
    novelId: string,
    startOrder: number,
    endOrder: number,
    preferredJobId?: string | null,
  ) {
    return this.pipelineService.findActivePipelineJobForRange(novelId, startOrder, endOrder, preferredJobId);
  }

  async resumePipelineJob(jobId: string) {
    return this.pipelineService.resumePipelineJob(jobId);
  }

  async retryPipelineJob(jobId: string) {
    return this.pipelineService.retryPipelineJob(jobId);
  }

  async cancelPipelineJob(jobId: string) {
    return this.pipelineService.cancelPipelineJob(jobId);
  }

  async reviewChapter(novelId: string, chapterId: string, options: ReviewOptions = {}) {
    return this.reviewService.reviewChapter(novelId, chapterId, options);
  }

  async createRepairStream(novelId: string, chapterId: string, options: RepairOptions = {}) {
    return this.reviewService.createRepairStream(novelId, chapterId, options);
  }

  async getNovelState(novelId: string) {
    return this.reviewService.getNovelState(novelId);
  }

  async getLatestStateSnapshot(novelId: string) {
    return this.reviewService.getLatestStateSnapshot(novelId);
  }

  async getChapterStateSnapshot(novelId: string, chapterId: string) {
    return this.reviewService.getChapterStateSnapshot(novelId, chapterId);
  }

  async rebuildNovelState(novelId: string, options: LLMGenerateOptions = {}) {
    return this.reviewService.rebuildNovelState(novelId, options);
  }

  async generateBookPlan(novelId: string, options: LLMGenerateOptions = {}) {
    return this.reviewService.generateBookPlan(novelId, options);
  }

  async generateArcPlan(novelId: string, arcId: string, options: LLMGenerateOptions = {}) {
    return this.reviewService.generateArcPlan(novelId, arcId, options);
  }

  async generateChapterPlan(novelId: string, chapterId: string, options: LLMGenerateOptions = {}) {
    return this.reviewService.generateChapterPlan(novelId, chapterId, options);
  }

  async getChapterPlan(novelId: string, chapterId: string) {
    return this.reviewService.getChapterPlan(novelId, chapterId);
  }

  async replanNovel(
    novelId: string,
    input: {
      chapterId?: string;
      triggerType?: string;
      sourceIssueIds?: string[];
      windowSize?: number;
      reason: string;
    } & LLMGenerateOptions,
  ) {
    return this.reviewService.replanNovel(novelId, input);
  }

  async auditChapter(
    novelId: string,
    chapterId: string,
    scope: "full" | "continuity" | "character" | "plot" | "mode_fit",
    options: ReviewOptions = {},
  ) {
    return this.reviewService.auditChapter(novelId, chapterId, scope, options);
  }

  async listChapterAuditReports(novelId: string, chapterId: string) {
    return this.reviewService.listChapterAuditReports(novelId, chapterId);
  }

  async resolveAuditIssues(novelId: string, issueIds: string[]) {
    return this.reviewService.resolveAuditIssues(novelId, issueIds);
  }

  async getQualityReport(novelId: string) {
    return this.reviewService.getQualityReport(novelId);
  }

  async getPayoffLedger(novelId: string, chapterOrder?: number) {
    return this.reviewService.getPayoffLedger(novelId, chapterOrder);
  }

  async generateChapterHook(novelId: string, options: HookGenerateOptions = {}) {
    return this.generationService.generateChapterHook(novelId, options);
  }

  async createNovelSnapshot(
    novelId: string,
    triggerType: "manual" | "auto_milestone" | "before_pipeline",
    label?: string,
  ) {
    return this.snapshotService.createNovelSnapshot(novelId, triggerType, label);
  }

  async listNovelSnapshots(novelId: string) {
    return this.snapshotService.listNovelSnapshots(novelId);
  }

  async restoreFromSnapshot(novelId: string, snapshotId: string) {
    return this.snapshotService.restoreFromSnapshot(novelId, snapshotId);
  }
}
