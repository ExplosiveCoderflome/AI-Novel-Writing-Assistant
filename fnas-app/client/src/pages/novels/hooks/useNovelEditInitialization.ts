import { useEffect } from "react";
import type { BaseCharacter, Character, VolumePlan } from "@ai-novel/shared/types/novel";
import type { NovelDetailResponse } from "@/api/novel";
import {
  DEFAULT_ESTIMATED_CHAPTER_COUNT,
  formatCommercialTagsInput,
  type NovelBasicFormState,
} from "../novelBasicInfo.shared";

interface PipelineFormState {
  startOrder: number;
  endOrder: number;
  maxRetries: number;
  runMode: "fast" | "polish";
  autoReview: boolean;
  autoRepair: boolean;
  skipCompleted: boolean;
  qualityThreshold: number;
  repairMode: "detect_only" | "light_repair" | "heavy_repair" | "continuity_only" | "character_only" | "ending_only";
}

interface CharacterFormState {
  name: string;
  role: string;
  gender: "male" | "female" | "other" | "unknown";
  personality: string;
  background: string;
  development: string;
  currentState: string;
  currentGoal: string;
}

interface UseNovelEditInitializationArgs {
  detail?: NovelDetailResponse;
  chapters: NovelDetailResponse["chapters"];
  characters: Character[];
  baseCharacters: BaseCharacter[];
  basicForm: NovelBasicFormState;
  selectedCharacter?: Character;
  selectedChapterId: string;
  selectedCharacterId: string;
  selectedBaseCharacterId: string;
  sourceNovelBookAnalysisOptions: Array<{ id: string }>;
  sourceBookAnalysesLoading: boolean;
  sourceBookAnalysesFetching: boolean;
  setBasicForm: (value: NovelBasicFormState | ((prev: NovelBasicFormState) => NovelBasicFormState)) => void;
  setVolumeDraft: (value: VolumePlan[]) => void;
  setPipelineForm: (value: PipelineFormState | ((prev: PipelineFormState) => PipelineFormState)) => void;
  setSelectedChapterId: (value: string) => void;
  setSelectedCharacterId: (value: string) => void;
  setSelectedBaseCharacterId: (value: string) => void;
  setCharacterForm: (value: CharacterFormState) => void;
}

const EMPTY_CHARACTER_FORM: CharacterFormState = {
  name: "",
  role: "",
  gender: "unknown",
  personality: "",
  background: "",
  development: "",
  currentState: "",
  currentGoal: "",
};

export function useNovelEditInitialization({
  detail,
  chapters,
  characters,
  baseCharacters,
  basicForm,
  selectedCharacter,
  selectedChapterId,
  selectedCharacterId,
  selectedBaseCharacterId,
  sourceNovelBookAnalysisOptions,
  sourceBookAnalysesLoading,
  sourceBookAnalysesFetching,
  setBasicForm,
  setVolumeDraft,
  setPipelineForm,
  setSelectedChapterId,
  setSelectedCharacterId,
  setSelectedBaseCharacterId,
  setCharacterForm,
}: UseNovelEditInitializationArgs) {
  useEffect(() => {
    if (!detail) {
      return;
    }

    setBasicForm({
      title: detail.title,
      description: detail.description ?? "",
      targetAudience: detail.targetAudience ?? "",
      bookSellingPoint: detail.bookSellingPoint ?? "",
      competingFeel: detail.competingFeel ?? "",
      first30ChapterPromise: detail.first30ChapterPromise ?? "",
      commercialTagsText: formatCommercialTagsInput(detail.commercialTags ?? []),
      genreId: detail.genreId ?? "",
      primaryStoryModeId: detail.primaryStoryModeId ?? "",
      secondaryStoryModeId: detail.secondaryStoryModeId ?? "",
      worldId: detail.worldId ?? "",
      status: detail.status,
      writingMode: detail.writingMode ?? "original",
      projectMode: detail.projectMode ?? "co_pilot",
      narrativePov: detail.narrativePov ?? "third_person",
      pacePreference: detail.pacePreference ?? "balanced",
      styleTone: detail.styleTone ?? "",
      emotionIntensity: detail.emotionIntensity ?? "medium",
      aiFreedom: detail.aiFreedom ?? "medium",
      defaultChapterLength: detail.defaultChapterLength ?? 2800,
      estimatedChapterCount: detail.estimatedChapterCount ?? DEFAULT_ESTIMATED_CHAPTER_COUNT,
      projectStatus: detail.projectStatus ?? "not_started",
      storylineStatus: detail.storylineStatus ?? "not_started",
      outlineStatus: detail.outlineStatus ?? "not_started",
      resourceReadyScore: detail.resourceReadyScore ?? 0,
      continuationSourceType: detail.sourceKnowledgeDocumentId ? "knowledge_document" : "novel",
      sourceNovelId: detail.sourceNovelId ?? "",
      sourceKnowledgeDocumentId: detail.sourceKnowledgeDocumentId ?? "",
      continuationBookAnalysisId: detail.continuationBookAnalysisId ?? "",
      continuationBookAnalysisSections: detail.continuationBookAnalysisSections ?? [],
    });
    setVolumeDraft(detail.volumes ?? []);
    const recommendedEndOrder = Math.max(
      detail.estimatedChapterCount ?? DEFAULT_ESTIMATED_CHAPTER_COUNT,
      detail.volumes?.flatMap((volume) => volume.chapters).length ?? 0,
      detail.chapters.length || 0,
      1,
    );
    setPipelineForm((prev) => ({
      ...prev,
      endOrder: Math.max(prev.endOrder, recommendedEndOrder),
    }));
  }, [detail, setBasicForm, setPipelineForm, setVolumeDraft]);

  useEffect(() => {
    if (!selectedChapterId && chapters.length > 0) {
      setSelectedChapterId(chapters[0].id);
    }
  }, [chapters, selectedChapterId, setSelectedChapterId]);

  useEffect(() => {
    if (!selectedCharacterId && characters.length > 0) {
      setSelectedCharacterId(characters[0].id);
    }
  }, [characters, selectedCharacterId, setSelectedCharacterId]);

  useEffect(() => {
    if (!selectedBaseCharacterId && baseCharacters.length > 0) {
      setSelectedBaseCharacterId(baseCharacters[0].id);
    }
  }, [baseCharacters, selectedBaseCharacterId, setSelectedBaseCharacterId]);

  useEffect(() => {
    if (
      basicForm.writingMode !== "continuation"
      || !basicForm.continuationBookAnalysisId
    ) {
      return;
    }
    if (sourceBookAnalysesLoading || sourceBookAnalysesFetching) {
      return;
    }
    const exists = sourceNovelBookAnalysisOptions.some((item) => item.id === basicForm.continuationBookAnalysisId);
    if (exists) {
      return;
    }
    setBasicForm((prev) => ({
      ...prev,
      continuationBookAnalysisId: "",
      continuationBookAnalysisSections: [],
    }));
  }, [
    basicForm.continuationBookAnalysisId,
    basicForm.writingMode,
    sourceBookAnalysesFetching,
    sourceBookAnalysesLoading,
    sourceNovelBookAnalysisOptions,
    setBasicForm,
  ]);

  useEffect(() => {
    if (!selectedCharacter) {
      setCharacterForm(EMPTY_CHARACTER_FORM);
      return;
    }
    setCharacterForm({
      name: selectedCharacter.name ?? "",
      role: selectedCharacter.role ?? "",
      gender: selectedCharacter.gender ?? "unknown",
      personality: selectedCharacter.personality ?? "",
      background: selectedCharacter.background ?? "",
      development: selectedCharacter.development ?? "",
      currentState: selectedCharacter.currentState ?? "",
      currentGoal: selectedCharacter.currentGoal ?? "",
    });
  }, [selectedCharacter, setCharacterForm]);
}
