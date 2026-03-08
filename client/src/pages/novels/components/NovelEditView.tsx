import { useState } from "react";
import type {
  BaseCharacter,
  Chapter,
  Character,
  CharacterTimeline,
  NovelBible,
  PipelineJob,
  PlotBeat,
  QualityScore,
  ReviewIssue,
} from "@ai-novel/shared/types/novel";
import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import KnowledgeBindingPanel from "@/components/knowledge/KnowledgeBindingPanel";
import NovelCharacterPanel from "./NovelCharacterPanel";
import BasicInfoTab from "./BasicInfoTab";
import OutlineTab from "./OutlineTab";
import StructuredOutlineTab from "./StructuredOutlineTab";
import ChapterManagementTab from "./ChapterManagementTab";
import PipelineTab from "./PipelineTab";
import type { StructuredVolume } from "../novelEdit.utils";

interface BasicTabProps {
  basicForm: {
    title: string;
    description: string;
    worldId: string;
    status: "draft" | "published";
    writingMode: "original" | "continuation";
    continuationSourceType: "novel" | "knowledge_document";
    sourceNovelId: string;
    sourceKnowledgeDocumentId: string;
    continuationBookAnalysisId: string;
    continuationBookAnalysisSections: BookAnalysisSectionKey[];
  };
  worldOptions: Array<{ id: string; name: string }>;
  sourceNovelOptions: Array<{ id: string; title: string }>;
  sourceKnowledgeOptions: Array<{ id: string; title: string }>;
  sourceNovelBookAnalysisOptions: Array<{
    id: string;
    title: string;
    documentTitle: string;
    documentVersionNumber: number;
  }>;
  isLoadingSourceNovelBookAnalyses: boolean;
  availableBookAnalysisSections: Array<{ key: BookAnalysisSectionKey; title: string }>;
  onFormChange: (patch: Partial<BasicTabProps["basicForm"]>) => void;
  onSave: () => void;
  isSaving: boolean;
}

interface OutlineTabViewProps {
  worldInjectionSummary: string | null;
  hasCharacters: boolean;
  isGenerating: boolean;
  streamContent: string;
  onGenerate: () => void;
  onStop: () => void;
  onAbortStream: () => void;
  onGoToCharacterTab: () => void;
  generationPrompt: string;
  onGenerationPromptChange: (next: string) => void;
  draftText: string;
  onDraftTextChange: (next: string) => void;
  onSave: () => void;
  isSaving: boolean;
  optimizeInstruction: string;
  onOptimizeInstructionChange: (next: string) => void;
  onOptimizeFull: () => void;
  onOptimizeSelection: (selectedText: string) => void;
  isOptimizing: boolean;
  optimizePreview: string;
  onApplyOptimizePreview: () => void;
  onCancelOptimizePreview: () => void;
}

interface StructuredTabViewProps extends Omit<
  OutlineTabViewProps,
  "onGenerate" | "onStop" | "onSave" | "isSaving" | "generationPrompt" | "onGenerationPromptChange"
> {
  isGenerating: boolean;
  streamContent: string;
  onGenerate: () => void;
  onStop: () => void;
  onResyncChapters: () => void;
  isResyncing: boolean;
  draftText: string;
  onDraftTextChange: (next: string) => void;
  onSave: () => void;
  isSaving: boolean;
  structuredVolumes: StructuredVolume[];
}

interface ChapterTabViewProps {
  novelId: string;
  worldInjectionSummary: string | null;
  hasCharacters: boolean;
  chapters: Chapter[];
  selectedChapterId: string;
  selectedChapter?: Chapter;
  onSelectChapter: (chapterId: string) => void;
  onGoToCharacterTab: () => void;
  onCreateChapter: () => void;
  isCreatingChapter: boolean;
  onGenerateSelectedChapter: () => void;
  streamContent: string;
  isStreaming: boolean;
  onAbortStream: () => void;
}

interface PipelineTabViewProps {
  novelId: string;
  worldInjectionSummary: string | null;
  hasCharacters: boolean;
  onGoToCharacterTab: () => void;
  pipelineForm: {
    startOrder: number;
    endOrder: number;
    maxRetries: number;
  };
  onPipelineFormChange: (field: "startOrder" | "endOrder" | "maxRetries", value: number) => void;
  maxOrder: number;
  onGenerateBible: () => void;
  onAbortBible: () => void;
  isBibleStreaming: boolean;
  bibleStreamContent: string;
  onGenerateBeats: () => void;
  onAbortBeats: () => void;
  isBeatsStreaming: boolean;
  beatsStreamContent: string;
  onRunPipeline: () => void;
  isRunningPipeline: boolean;
  pipelineMessage: string;
  pipelineJob?: PipelineJob;
  chapters: Chapter[];
  selectedChapterId: string;
  onSelectedChapterChange: (chapterId: string) => void;
  onReviewChapter: () => void;
  isReviewing: boolean;
  onRepairChapter: () => void;
  isRepairing: boolean;
  onGenerateHook: () => void;
  isGeneratingHook: boolean;
  reviewResult: {
    score: QualityScore;
    issues: ReviewIssue[];
  } | null;
  repairBeforeContent: string;
  repairAfterContent: string;
  repairStreamContent: string;
  isRepairStreaming: boolean;
  onAbortRepair: () => void;
  qualitySummary?: QualityScore;
  chapterReports: Array<{
    chapterId?: string | null;
    coherence: number;
    repetition: number;
    pacing: number;
    voice: number;
    engagement: number;
    overall: number;
  }>;
  bible?: NovelBible | null;
  plotBeats: PlotBeat[];
}

interface CharacterTabViewProps {
  characterMessage: string;
  quickCharacterForm: { name: string; role: string };
  onQuickCharacterFormChange: (field: "name" | "role", value: string) => void;
  onQuickCreateCharacter: () => void;
  isQuickCreating: boolean;
  characters: Character[];
  coreCharacterCount: number;
  baseCharacters: BaseCharacter[];
  selectedBaseCharacterId: string;
  onSelectedBaseCharacterChange: (id: string) => void;
  selectedBaseCharacter?: BaseCharacter;
  importedBaseCharacterIds: Set<string>;
  onImportBaseCharacter: () => void;
  isImportingBaseCharacter: boolean;
  selectedCharacterId: string;
  onSelectedCharacterChange: (id: string) => void;
  onDeleteCharacter: (id: string) => void;
  isDeletingCharacter: boolean;
  deletingCharacterId: string;
  onSyncTimeline: () => void;
  isSyncingTimeline: boolean;
  onSyncAllTimeline: () => void;
  isSyncingAllTimeline: boolean;
  onEvolveCharacter: () => void;
  isEvolvingCharacter: boolean;
  onWorldCheck: () => void;
  isCheckingWorld: boolean;
  selectedCharacter?: Character;
  characterForm: {
    name: string;
    role: string;
    personality: string;
    background: string;
    development: string;
    currentState: string;
    currentGoal: string;
  };
  onCharacterFormChange: (
    field: "name" | "role" | "personality" | "background" | "development" | "currentState" | "currentGoal",
    value: string,
  ) => void;
  onSaveCharacter: () => void;
  isSavingCharacter: boolean;
  timelineEvents: CharacterTimeline[];
}

interface NovelEditViewProps {
  id: string;
  activeTab: string;
  onActiveTabChange: (value: string) => void;
  basicTab: BasicTabProps;
  outlineTab: OutlineTabViewProps;
  structuredTab: StructuredTabViewProps;
  chapterTab: ChapterTabViewProps;
  pipelineTab: PipelineTabViewProps;
  characterTab: CharacterTabViewProps;
}

export default function NovelEditView(props: NovelEditViewProps) {
  const { id, activeTab, onActiveTabChange, basicTab, outlineTab, structuredTab, chapterTab, pipelineTab, characterTab } = props;
  const [isKnowledgeBindingOpen, setIsKnowledgeBindingOpen] = useState(false);

  return (
    <>
      {id ? (
        <div className="flex justify-end">
          <Dialog open={isKnowledgeBindingOpen} onOpenChange={setIsKnowledgeBindingOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary">小说知识库绑定</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl overflow-auto">
              <DialogHeader>
                <DialogTitle>小说知识库绑定</DialogTitle>
              </DialogHeader>
              <KnowledgeBindingPanel targetType="novel" targetId={id} title="参考知识" />
            </DialogContent>
          </Dialog>
        </div>
      ) : null}

      <Tabs value={activeTab} onValueChange={onActiveTabChange} className="space-y-4">
        <TabsList>
          <TabsTrigger value="basic">基本信息</TabsTrigger>
          <TabsTrigger value="character">角色管理</TabsTrigger>
          <TabsTrigger value="outline">发展走向</TabsTrigger>
          <TabsTrigger value="structured">章节大纲</TabsTrigger>
          <TabsTrigger value="chapter">章节管理</TabsTrigger>
          <TabsTrigger value="pipeline">自动流水线</TabsTrigger>
        </TabsList>

        <TabsContent value="basic">
          <BasicInfoTab {...basicTab} />
        </TabsContent>
        <TabsContent value="outline">
          <OutlineTab {...outlineTab} />
        </TabsContent>
        <TabsContent value="structured">
          <StructuredOutlineTab {...structuredTab} />
        </TabsContent>
        <TabsContent value="chapter">
          <ChapterManagementTab {...chapterTab} />
        </TabsContent>
        <TabsContent value="pipeline">
          <PipelineTab {...pipelineTab} />
        </TabsContent>

        <TabsContent value="character">
          <NovelCharacterPanel
            characterMessage={characterTab.characterMessage}
            quickCharacterForm={characterTab.quickCharacterForm}
            onQuickCharacterFormChange={characterTab.onQuickCharacterFormChange}
            onQuickCreateCharacter={characterTab.onQuickCreateCharacter}
            isQuickCreating={characterTab.isQuickCreating}
            characters={characterTab.characters}
            coreCharacterCount={characterTab.coreCharacterCount}
            baseCharacters={characterTab.baseCharacters}
            selectedBaseCharacterId={characterTab.selectedBaseCharacterId}
            onSelectedBaseCharacterChange={characterTab.onSelectedBaseCharacterChange}
            selectedBaseCharacter={characterTab.selectedBaseCharacter}
            importedBaseCharacterIds={characterTab.importedBaseCharacterIds}
            onImportBaseCharacter={characterTab.onImportBaseCharacter}
            isImportingBaseCharacter={characterTab.isImportingBaseCharacter}
            selectedCharacterId={characterTab.selectedCharacterId}
            onSelectedCharacterChange={characterTab.onSelectedCharacterChange}
            onDeleteCharacter={characterTab.onDeleteCharacter}
            isDeletingCharacter={characterTab.isDeletingCharacter}
            deletingCharacterId={characterTab.deletingCharacterId}
            onSyncTimeline={characterTab.onSyncTimeline}
            isSyncingTimeline={characterTab.isSyncingTimeline}
            onSyncAllTimeline={characterTab.onSyncAllTimeline}
            isSyncingAllTimeline={characterTab.isSyncingAllTimeline}
            onEvolveCharacter={characterTab.onEvolveCharacter}
            isEvolvingCharacter={characterTab.isEvolvingCharacter}
            onWorldCheck={characterTab.onWorldCheck}
            isCheckingWorld={characterTab.isCheckingWorld}
            selectedCharacter={characterTab.selectedCharacter}
            characterForm={characterTab.characterForm}
            onCharacterFormChange={characterTab.onCharacterFormChange}
            onSaveCharacter={characterTab.onSaveCharacter}
            isSavingCharacter={characterTab.isSavingCharacter}
            timelineEvents={characterTab.timelineEvents}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
