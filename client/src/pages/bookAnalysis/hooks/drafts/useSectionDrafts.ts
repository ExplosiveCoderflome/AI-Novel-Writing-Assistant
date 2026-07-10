import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type {
  BookAnalysisDetail,
  BookAnalysisSection,
  BookAnalysisSectionKey,
} from "@ai-novel/shared/types/bookAnalysis";
import {
  optimizeBookAnalysisSectionPreview,
  updateBookAnalysisSection,
} from "@/api/bookAnalysis";
import type { SectionDraft } from "../../bookAnalysis.types";
import { buildSectionDraft, syncDrafts } from "../../bookAnalysis.utils";

export function useSectionDrafts(input: {
  selectedAnalysis?: BookAnalysisDetail;
  refreshAnalysisData: (analysisId: string) => Promise<void>;
}) {
  const { selectedAnalysis, refreshAnalysisData } = input;
  const [sectionDrafts, setSectionDrafts] = useState<Record<string, SectionDraft>>({});
  const [draftAnalysisId, setDraftAnalysisId] = useState("");
  const [optimizingSectionKey, setOptimizingSectionKey] = useState<BookAnalysisSectionKey | null>(null);

  const setDraftsFromAnalysis = (analysis: BookAnalysisDetail) => {
    setDraftAnalysisId(analysis.id);
    setSectionDrafts(syncDrafts(analysis));
  };

  const getSectionDraft = (section: BookAnalysisSection): SectionDraft => {
    return sectionDrafts[section.id] ?? buildSectionDraft(section);
  };

  const updateSectionDraft = (section: BookAnalysisSection, patch: Partial<SectionDraft>) => {
    setSectionDrafts((prev) => ({
      ...prev,
      [section.id]: {
        ...(prev[section.id] ?? buildSectionDraft(section)),
        ...patch,
      },
    }));
  };

  const updateSectionMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      sectionKey: BookAnalysisSectionKey;
      editedContent?: string | null;
      notes?: string | null;
      focusInstruction?: string | null;
      frozen?: boolean;
    }) => updateBookAnalysisSection(payload.id, payload.sectionKey, payload),
    onSuccess: async (response) => {
      if (!response.data) {
        return;
      }
      setDraftsFromAnalysis(response.data);
      await refreshAnalysisData(response.data.id);
    },
  });

  const optimizePreviewMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      sectionKey: BookAnalysisSectionKey;
      currentDraft: string;
      instruction: string;
    }) => optimizeBookAnalysisSectionPreview(payload.id, payload.sectionKey, payload),
    onSuccess: (response, payload) => {
      const optimizedDraft = response.data?.optimizedDraft;
      if (!optimizedDraft || !selectedAnalysis) {
        return;
      }
      const section = selectedAnalysis.sections.find((item) => item.sectionKey === payload.sectionKey);
      if (!section) {
        return;
      }
      setSectionDrafts((prev) => ({
        ...prev,
        [section.id]: {
          ...(prev[section.id] ?? buildSectionDraft(section)),
          optimizePreview: optimizedDraft,
        },
      }));
    },
    onSettled: () => {
      setOptimizingSectionKey(null);
    },
  });

  useEffect(() => {
    if (!selectedAnalysis || draftAnalysisId === selectedAnalysis.id) {
      return;
    }
    setDraftsFromAnalysis(selectedAnalysis);
  }, [selectedAnalysis, draftAnalysisId]);

  const optimizeSectionPreview = async (section: BookAnalysisSection) => {
    if (!selectedAnalysis) {
      return;
    }
    const draft = getSectionDraft(section);
    const instruction = draft.optimizeInstruction.trim();
    if (!instruction) {
      return;
    }
    setOptimizingSectionKey(section.sectionKey);
    await optimizePreviewMutation.mutateAsync({
      id: selectedAnalysis.id,
      sectionKey: section.sectionKey,
      currentDraft: draft.editedContent,
      instruction,
    });
  };

  const applySectionOptimizePreview = (section: BookAnalysisSection) => {
    const draft = getSectionDraft(section);
    if (!draft.optimizePreview.trim()) {
      return;
    }
    updateSectionDraft(section, {
      editedContent: draft.optimizePreview,
      optimizePreview: "",
    });
  };

  const clearSectionOptimizePreview = (section: BookAnalysisSection) => {
    updateSectionDraft(section, {
      optimizePreview: "",
    });
  };

  const saveSection = (section: BookAnalysisSection) => {
    if (!selectedAnalysis) {
      return;
    }
    const draft = getSectionDraft(section);
    const normalize = (value: string | null | undefined) => value?.replace(/\r\n?/g, "\n").trim() ?? "";
    const normalizedDraft = normalize(draft.editedContent);
    const normalizedAi = normalize(section.aiContent ?? "");
    const editedContent = normalizedDraft && normalizedDraft !== normalizedAi ? draft.editedContent : null;
    updateSectionMutation.mutate({
      id: selectedAnalysis.id,
      sectionKey: section.sectionKey,
      editedContent,
      notes: draft.notes.trim() ? draft.notes : null,
      focusInstruction: draft.focusInstruction.trim() ? draft.focusInstruction : null,
      frozen: draft.frozen,
    });
  };

  return {
    sectionDrafts,
    optimizingSectionKey,
    setDraftsFromAnalysis,
    getSectionDraft,
    updateSectionDraft,
    optimizeSectionPreview,
    applySectionOptimizePreview,
    clearSectionOptimizePreview,
    saveSection,
    pending: {
      optimizePreview: optimizePreviewMutation.isPending,
      saveSection: updateSectionMutation.isPending,
    },
  };
}
