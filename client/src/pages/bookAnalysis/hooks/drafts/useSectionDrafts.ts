import { useCallback, useEffect, useRef, useState } from "react";
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
import { buildSectionDraft, buildSectionUpdate, syncDrafts } from "../../bookAnalysis.utils";

function selectSyncedValue<T>(localValue: T, previousServerValue: T, nextServerValue: T): T {
  return Object.is(localValue, previousServerValue) ? nextServerValue : localValue;
}

function reconcileSectionDrafts(
  localDrafts: Record<string, SectionDraft>,
  previousServerDrafts: Record<string, SectionDraft>,
  nextServerDrafts: Record<string, SectionDraft>,
): Record<string, SectionDraft> {
  return Object.fromEntries(
    Object.entries(nextServerDrafts).map(([sectionId, nextServerDraft]) => {
      const localDraft = localDrafts[sectionId];
      const previousServerDraft = previousServerDrafts[sectionId];
      if (!localDraft || !previousServerDraft) {
        return [sectionId, nextServerDraft];
      }

      return [
        sectionId,
        {
          editedContent: selectSyncedValue(
            localDraft.editedContent,
            previousServerDraft.editedContent,
            nextServerDraft.editedContent,
          ),
          notes: selectSyncedValue(localDraft.notes, previousServerDraft.notes, nextServerDraft.notes),
          focusInstruction: selectSyncedValue(
            localDraft.focusInstruction,
            previousServerDraft.focusInstruction,
            nextServerDraft.focusInstruction,
          ),
          frozen: selectSyncedValue(localDraft.frozen, previousServerDraft.frozen, nextServerDraft.frozen),
          optimizeInstruction: localDraft.optimizeInstruction,
          optimizePreview: localDraft.optimizePreview,
        },
      ];
    }),
  );
}

export function useSectionDrafts(input: {
  selectedAnalysis?: BookAnalysisDetail;
  refreshAnalysisData: (analysisId: string) => Promise<void>;
}) {
  const { selectedAnalysis, refreshAnalysisData } = input;
  const [sectionDrafts, setSectionDrafts] = useState<Record<string, SectionDraft>>({});
  const draftAnalysisIdRef = useRef("");
  const serverDraftsRef = useRef<Record<string, SectionDraft>>({});
  const [optimizingSectionKey, setOptimizingSectionKey] = useState<BookAnalysisSectionKey | null>(null);

  const setDraftsFromAnalysis = useCallback((
    analysis: BookAnalysisDetail,
    saved?: { sectionId: string; draft: SectionDraft; changes: ReturnType<typeof buildSectionUpdate> },
  ) => {
    const nextServerDrafts = syncDrafts(analysis);
    const isSameAnalysis = draftAnalysisIdRef.current === analysis.id;
    const previousServerDrafts = saved
      ? {
        ...serverDraftsRef.current,
        [saved.sectionId]: {
          ...saved.draft,
          editedContent: saved.changes.editedContent === undefined
            ? serverDraftsRef.current[saved.sectionId]?.editedContent ?? saved.draft.editedContent
            : saved.draft.editedContent,
        },
      }
      : serverDraftsRef.current;

    setSectionDrafts((localDrafts) => (
      isSameAnalysis
        ? reconcileSectionDrafts(localDrafts, previousServerDrafts, nextServerDrafts)
        : nextServerDrafts
    ));
    draftAnalysisIdRef.current = analysis.id;
    serverDraftsRef.current = nextServerDrafts;
  }, []);

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
      sectionId: string;
      draft: SectionDraft;
      changes: ReturnType<typeof buildSectionUpdate>;
    }) => updateBookAnalysisSection(payload.id, payload.sectionKey, payload.changes),
    onSuccess: async (response, payload) => {
      if (!response.data) {
        return;
      }
      if (draftAnalysisIdRef.current === response.data.id) {
        setDraftsFromAnalysis(response.data, payload);
      }
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
    onSettled: async (_response, _error, payload) => {
      setOptimizingSectionKey(null);
      await refreshAnalysisData(payload.id);
    },
  });

  useEffect(() => {
    if (!selectedAnalysis) {
      return;
    }
    setDraftsFromAnalysis(selectedAnalysis);
  }, [selectedAnalysis, setDraftsFromAnalysis]);

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
    const savedDraft = serverDraftsRef.current[section.id] ?? buildSectionDraft(section);
    updateSectionMutation.mutate({
      id: selectedAnalysis.id,
      sectionKey: section.sectionKey,
      sectionId: section.id,
      draft,
      changes: buildSectionUpdate(draft, savedDraft),
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
