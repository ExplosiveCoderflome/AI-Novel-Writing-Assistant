import type { NovelCoreService } from "../NovelCoreService";

type NovelApplicationMethod = (...args: any[]) => any;
type NovelDetailWithVolumeWorkspace = NonNullable<Awaited<ReturnType<NovelCoreService["getNovelById"]>>> & {
  volumes?: unknown;
  volumeSource?: unknown;
  activeVolumeVersionId?: string | null;
};

export interface NovelApplicationServices {
  listNovels: NovelApplicationMethod;
  createNovel: NovelApplicationMethod;
  getNovelById: (...args: Parameters<NovelCoreService["getNovelById"]>) => Promise<NovelDetailWithVolumeWorkspace | null>;
  updateNovel: NovelApplicationMethod;
  deleteNovel: NovelApplicationMethod;
  listChapters: NovelApplicationMethod;
  createChapter: NovelApplicationMethod;
  updateChapter: NovelApplicationMethod;
  deleteChapter: NovelApplicationMethod;
  listCharacters: NovelApplicationMethod;
  createCharacter: NovelApplicationMethod;
  updateCharacter: NovelApplicationMethod;
  deleteCharacter: NovelApplicationMethod;
  listCharacterTimeline: NovelApplicationMethod;
  syncCharacterTimeline: NovelApplicationMethod;
  syncAllCharacterTimeline: NovelApplicationMethod;
  evolveCharacter: NovelApplicationMethod;
  checkCharacterAgainstWorld: NovelApplicationMethod;
  createNovelSnapshot: NovelApplicationMethod;
  listNovelSnapshots: NovelApplicationMethod;
  restoreFromSnapshot: NovelApplicationMethod;
  createOutlineStream: NovelApplicationMethod;
  createStructuredOutlineStream: NovelApplicationMethod;
  createChapterStream: NovelApplicationMethod;
  createChapterRuntimeStream: NovelApplicationMethod;
  generateTitles: NovelApplicationMethod;
  createBibleStream: NovelApplicationMethod;
  createBeatStream: NovelApplicationMethod;
  generateChapterHook: NovelApplicationMethod;
  reviewChapter: NovelApplicationMethod;
  createRepairStream: NovelApplicationMethod;
  getQualityReport: NovelApplicationMethod;
  startPipelineJob: NovelApplicationMethod;
  getPipelineJob: NovelApplicationMethod;
  getPipelineJobById: NovelApplicationMethod;
  findActivePipelineJobForRange: NovelApplicationMethod;
  resumePipelineJob: NovelApplicationMethod;
  retryPipelineJob: NovelApplicationMethod;
  cancelPipelineJob: NovelApplicationMethod;
  getVolumes: NovelApplicationMethod;
  updateVolumes: NovelApplicationMethod;
  generateVolumes: NovelApplicationMethod;
  listVolumeVersions: NovelApplicationMethod;
  getVolumeVersion: NovelApplicationMethod;
  createVolumeDraft: NovelApplicationMethod;
  activateVolumeVersion: NovelApplicationMethod;
  freezeVolumeVersion: NovelApplicationMethod;
  getVolumeDiff: NovelApplicationMethod;
  analyzeVolumeImpact: NovelApplicationMethod;
  syncVolumeChapters: NovelApplicationMethod;
  ensureChapterExecutionContract: NovelApplicationMethod;
  migrateLegacyVolumes: NovelApplicationMethod;
  listStorylineVersions: NovelApplicationMethod;
  createStorylineDraft: NovelApplicationMethod;
  activateStorylineVersion: NovelApplicationMethod;
  freezeStorylineVersion: NovelApplicationMethod;
  getStorylineDiff: NovelApplicationMethod;
  analyzeStorylineImpact: NovelApplicationMethod;
  previewChapterRewrite: NovelApplicationMethod;
  previewChapterAiRevision: NovelApplicationMethod;
  previewChapterContinue: NovelApplicationMethod;
  previewChapterIssueFix: NovelApplicationMethod;
  getChapterEditorWorkspace: NovelApplicationMethod;
  getNovelState: NovelApplicationMethod;
  getLatestStateSnapshot: NovelApplicationMethod;
  getChapterStateSnapshot: NovelApplicationMethod;
  rebuildNovelState: NovelApplicationMethod;
  generateBookPlan: NovelApplicationMethod;
  generateArcPlan: NovelApplicationMethod;
  generateChapterPlan: NovelApplicationMethod;
  getChapterPlan: NovelApplicationMethod;
  replanNovel: NovelApplicationMethod;
  auditChapter: NovelApplicationMethod;
  listChapterAuditReports: NovelApplicationMethod;
  resolveAuditIssues: NovelApplicationMethod;
  getPayoffLedger: NovelApplicationMethod;
  getWorldSlice: NovelApplicationMethod;
  refreshWorldSlice: NovelApplicationMethod;
  updateWorldSliceOverrides: NovelApplicationMethod;
  getNovelWorld: NovelApplicationMethod;
  getNovelWorldSyncDiff: NovelApplicationMethod;
  importNovelWorldFromLibrary: NovelApplicationMethod;
  createManualNovelWorld: NovelApplicationMethod;
  generateNovelWorldFromTheme: NovelApplicationMethod;
  saveNovelWorldToLibrary: NovelApplicationMethod;
  syncNovelWorldWithLibrary: NovelApplicationMethod;
  listCharacterRelations: NovelApplicationMethod;
  listCharacterCastOptions: NovelApplicationMethod;
  generateCharacterCastOptions: NovelApplicationMethod;
  applyCharacterCastOption: NovelApplicationMethod;
  generateSupplementalCharacters: NovelApplicationMethod;
  applySupplementalCharacter: NovelApplicationMethod;
  deleteCharacterCastOption: NovelApplicationMethod;
  clearCharacterCastOptions: NovelApplicationMethod;
  generateCharacterVisibleProfile: NovelApplicationMethod;
  generateBatchCharacterVisibleProfiles: NovelApplicationMethod;
  applyCharacterVisibleProfile: NovelApplicationMethod;
  applyBatchCharacterVisibleProfiles: NovelApplicationMethod;
  getCharacterDynamicsOverview: NovelApplicationMethod;
  listCharacterCandidates: NovelApplicationMethod;
  confirmCharacterCandidate: NovelApplicationMethod;
  mergeCharacterCandidate: NovelApplicationMethod;
  updateCharacterDynamicState: NovelApplicationMethod;
  updateCharacterRelationStage: NovelApplicationMethod;
  rebuildCharacterDynamics: NovelApplicationMethod;
  getCharacterMindState: NovelApplicationMethod;
  refreshCharacterMindState: NovelApplicationMethod;
  listCharacterInfluenceProposals: NovelApplicationMethod;
  generateCharacterInfluenceProposals: NovelApplicationMethod;
  acceptCharacterInfluenceProposal: NovelApplicationMethod;
  dismissCharacterInfluenceProposal: NovelApplicationMethod;
  getActiveCharacterDialogueSession: NovelApplicationMethod;
  startCharacterDialogueSession: NovelApplicationMethod;
  sendCharacterDialogueTurn: NovelApplicationMethod;
  activateCharacterDialogueInfluence: NovelApplicationMethod;
  dismissCharacterDialogueInfluence: NovelApplicationMethod;
}

export const novelApplicationServiceMethodNames = [
  "listNovels",
  "createNovel",
  "getNovelById",
  "updateNovel",
  "deleteNovel",
  "listChapters",
  "createChapter",
  "updateChapter",
  "deleteChapter",
  "listCharacters",
  "createCharacter",
  "updateCharacter",
  "deleteCharacter",
  "listCharacterTimeline",
  "syncCharacterTimeline",
  "syncAllCharacterTimeline",
  "evolveCharacter",
  "checkCharacterAgainstWorld",
  "createNovelSnapshot",
  "listNovelSnapshots",
  "restoreFromSnapshot",
  "createOutlineStream",
  "createStructuredOutlineStream",
  "createChapterStream",
  "createChapterRuntimeStream",
  "generateTitles",
  "createBibleStream",
  "createBeatStream",
  "generateChapterHook",
  "reviewChapter",
  "createRepairStream",
  "getQualityReport",
  "startPipelineJob",
  "getPipelineJob",
  "getPipelineJobById",
  "findActivePipelineJobForRange",
  "resumePipelineJob",
  "retryPipelineJob",
  "cancelPipelineJob",
  "getVolumes",
  "updateVolumes",
  "generateVolumes",
  "listVolumeVersions",
  "getVolumeVersion",
  "createVolumeDraft",
  "activateVolumeVersion",
  "freezeVolumeVersion",
  "getVolumeDiff",
  "analyzeVolumeImpact",
  "syncVolumeChapters",
  "ensureChapterExecutionContract",
  "migrateLegacyVolumes",
  "listStorylineVersions",
  "createStorylineDraft",
  "activateStorylineVersion",
  "freezeStorylineVersion",
  "getStorylineDiff",
  "analyzeStorylineImpact",
  "previewChapterRewrite",
  "previewChapterAiRevision",
  "previewChapterContinue",
  "previewChapterIssueFix",
  "getChapterEditorWorkspace",
  "getNovelState",
  "getLatestStateSnapshot",
  "getChapterStateSnapshot",
  "rebuildNovelState",
  "generateBookPlan",
  "generateArcPlan",
  "generateChapterPlan",
  "getChapterPlan",
  "replanNovel",
  "auditChapter",
  "listChapterAuditReports",
  "resolveAuditIssues",
  "getPayoffLedger",
  "getWorldSlice",
  "refreshWorldSlice",
  "updateWorldSliceOverrides",
  "getNovelWorld",
  "getNovelWorldSyncDiff",
  "importNovelWorldFromLibrary",
  "createManualNovelWorld",
  "generateNovelWorldFromTheme",
  "saveNovelWorldToLibrary",
  "syncNovelWorldWithLibrary",
  "listCharacterRelations",
  "listCharacterCastOptions",
  "generateCharacterCastOptions",
  "applyCharacterCastOption",
  "generateSupplementalCharacters",
  "applySupplementalCharacter",
  "deleteCharacterCastOption",
  "clearCharacterCastOptions",
  "generateCharacterVisibleProfile",
  "generateBatchCharacterVisibleProfiles",
  "applyCharacterVisibleProfile",
  "applyBatchCharacterVisibleProfiles",
  "getCharacterDynamicsOverview",
  "listCharacterCandidates",
  "confirmCharacterCandidate",
  "mergeCharacterCandidate",
  "updateCharacterDynamicState",
  "updateCharacterRelationStage",
  "rebuildCharacterDynamics",
  "getCharacterMindState",
  "refreshCharacterMindState",
  "listCharacterInfluenceProposals",
  "generateCharacterInfluenceProposals",
  "acceptCharacterInfluenceProposal",
  "dismissCharacterInfluenceProposal",
  "getActiveCharacterDialogueSession",
  "startCharacterDialogueSession",
  "sendCharacterDialogueTurn",
  "activateCharacterDialogueInfluence",
  "dismissCharacterDialogueInfluence",
] as const satisfies readonly (keyof NovelApplicationServices)[];
