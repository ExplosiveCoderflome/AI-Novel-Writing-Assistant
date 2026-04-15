import type {
  Chapter,
  ChapterSummary,
  Character,
  CharacterRelation,
  CharacterTimeline,
  Novel,
  NovelBible,
  PayoffLedgerResponse,
  PipelineJob,
  PlotBeat,
  VolumePlanDocument,
} from "@ai-novel/shared/types/novel";
import type { CharacterCastOption } from "@ai-novel/shared/types/novelCharacter";
import type { BookContract } from "@ai-novel/shared/types/novelWorkflow";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import type { StoryWorldSliceView } from "@ai-novel/shared/types/storyWorldSlice";
import type { NovelExportScope } from "@ai-novel/shared/types/novelExport";

export type ExportChapter = Chapter & { chapterSummary?: ChapterSummary | null };
export type ExportCharacter = Character;
export type ExportPlotBeat = PlotBeat;
export type ExportBible = NovelBible;

export interface ExportNovelDetail extends Novel {
  chapters: ExportChapter[];
  characters: ExportCharacter[];
  bible?: ExportBible | null;
  plotBeats?: ExportPlotBeat[];
  genre?: {
    id: string;
    name: string;
  } | null;
  primaryStoryMode?: {
    id: string;
    name: string;
    description?: string | null;
    template?: string | null;
    parentId?: string | null;
    profileJson?: string | null;
  } | null;
  secondaryStoryMode?: {
    id: string;
    name: string;
    description?: string | null;
    template?: string | null;
    parentId?: string | null;
    profileJson?: string | null;
  } | null;
  world?: {
    id: string;
    name: string;
    worldType?: string | null;
    description?: string | null;
    overviewSummary?: string | null;
    axioms?: string | null;
    magicSystem?: string | null;
    conflicts?: string | null;
  } | null;
  bookContract?: BookContract | null;
}

export interface ExportChapterPlanScene {
  id: string;
  sortOrder: number;
  title: string;
  objective?: string | null;
  conflict?: string | null;
  reveal?: string | null;
  emotionBeat?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExportChapterPlan {
  id: string;
  chapterId?: string | null;
  chapterOrder?: number | null;
  chapterTitle?: string | null;
  title: string;
  objective: string;
  planRole?: string | null;
  phaseLabel?: string | null;
  hookTarget?: string | null;
  status: string;
  participantsJson?: string | null;
  revealsJson?: string | null;
  riskNotesJson?: string | null;
  mustAdvanceJson?: string | null;
  mustPreserveJson?: string | null;
  sourceIssueIdsJson?: string | null;
  rawPlanJson?: string | null;
  scenes: ExportChapterPlanScene[];
  createdAt: string;
  updatedAt: string;
}

export interface ExportAuditIssue {
  id: string;
  auditType: string;
  severity: string;
  code: string;
  description: string;
  evidence: string;
  fixSuggestion: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExportChapterAuditReport {
  id: string;
  chapterId?: string | null;
  chapterOrder?: number | null;
  chapterTitle?: string | null;
  auditType: string;
  overallScore?: number | null;
  summary?: string | null;
  issues: ExportAuditIssue[];
  createdAt: string;
  updatedAt: string;
}

export interface ExportTimelineGroup {
  characterId: string;
  characterName: string;
  events: CharacterTimeline[];
}

export interface ExportQualityReport {
  novelId: string;
  summary: {
    coherence: number;
    repetition: number;
    pacing: number;
    voice: number;
    engagement: number;
    overall: number;
  };
  chapterReports: Array<{
    chapterId?: string | null;
    coherence: number;
    repetition: number;
    pacing: number;
    voice: number;
    engagement: number;
    overall: number;
    issues?: string | null;
  }>;
  totalReports?: number;
}

export interface NovelExportBasicSection {
  novel: ExportNovelDetail;
  worldSlice: StoryWorldSliceView | null;
}

export interface NovelExportStoryMacroSection {
  storyMacroPlan: StoryMacroPlan | null;
  bookContract: BookContract | null;
}

export interface NovelExportCharacterSection {
  characters: ExportCharacter[];
  relations: CharacterRelation[];
  castOptions: CharacterCastOption[];
  timelines: ExportTimelineGroup[];
}

export interface NovelExportOutlineSection {
  workspace: VolumePlanDocument | null;
}

export interface NovelExportStructuredSection {
  workspace: VolumePlanDocument | null;
}

export interface NovelExportChapterSection {
  chapters: ExportChapter[];
  chapterPlans: ExportChapterPlan[];
  latestStateSnapshot: unknown | null;
}

export interface NovelExportPipelineSection {
  latestPipelineJob: PipelineJob | null;
  qualityReport: ExportQualityReport;
  bible: ExportBible | null;
  plotBeats: ExportPlotBeat[];
  payoffLedger: PayoffLedgerResponse | null;
  latestStateSnapshot: unknown | null;
  chapterAuditReports: ExportChapterAuditReport[];
}

export interface NovelExportSectionMap {
  basic: NovelExportBasicSection;
  story_macro: NovelExportStoryMacroSection;
  character: NovelExportCharacterSection;
  outline: NovelExportOutlineSection;
  structured: NovelExportStructuredSection;
  chapter: NovelExportChapterSection;
  pipeline: NovelExportPipelineSection;
}

export type NovelExportSectionScope = Exclude<NovelExportScope, "full">;

export interface NovelExportBundle {
  metadata: {
    exportedAt: string;
    novelId: string;
    novelTitle: string;
  };
  sections: NovelExportSectionMap;
}
