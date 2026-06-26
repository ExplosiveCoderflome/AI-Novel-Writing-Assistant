import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BookAnalysisDetail } from "@ai-novel/shared/types/bookAnalysis";
import type {
  BookAnalysisCharacterDimension,
  BookAnalysisCharacterGenerationDepth,
} from "@ai-novel/shared/types/bookAnalysisCharacter";
import type { CharacterProfile } from "@ai-novel/shared/types/characterProfile";
import {
  createBookAnalysisCharacter,
  deleteBookAnalysisCharacter,
  generateAllBookAnalysisCharacterCandidates,
  generateBookAnalysisCharacterProfile,
  generateBookAnalysisCharacters,
  identifyBookAnalysisCharacterCandidates,
  listBookAnalysisCharacters,
  updateBookAnalysisCharacter,
} from "@/api/bookAnalysis";
import { queryKeys } from "@/api/queryKeys";

export function useAnalysisCharacters(input: {
  selectedAnalysis?: BookAnalysisDetail;
  selectedAnalysisId: string;
}) {
  const queryClient = useQueryClient();
  const { selectedAnalysis, selectedAnalysisId } = input;
  const [generatingCharacterIds, setGeneratingCharacterIds] = useState<Set<string>>(() => new Set());

  const charactersQuery = useQuery({
    queryKey: queryKeys.bookAnalysis.characters(selectedAnalysisId || "none"),
    queryFn: () => listBookAnalysisCharacters(selectedAnalysisId),
    enabled: Boolean(selectedAnalysisId),
  });

  const refreshCharacterData = async (analysisId: string) => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.bookAnalysis.characters(analysisId) });
  };

  const generateCharactersMutation = useMutation({
    mutationFn: (payload: {
      analysisId: string;
      generationDepth: BookAnalysisCharacterGenerationDepth;
      selectedDimensions: BookAnalysisCharacterDimension[];
      characterNames?: string[];
    }) => generateBookAnalysisCharacters(payload.analysisId, {
      generationDepth: payload.generationDepth,
      selectedDimensions: payload.selectedDimensions,
      characterNames: payload.characterNames,
    }),
    onSuccess: async (_response, payload) => {
      await refreshCharacterData(payload.analysisId);
    },
  });

  const identifyCharactersMutation = useMutation({
    mutationFn: (payload: { analysisId: string }) => identifyBookAnalysisCharacterCandidates(payload.analysisId),
    onSuccess: async (_response, payload) => {
      await refreshCharacterData(payload.analysisId);
    },
  });

  const generateCharacterProfileMutation = useMutation({
    mutationFn: (payload: {
      analysisId: string;
      characterId: string;
      generationDepth: BookAnalysisCharacterGenerationDepth;
      selectedDimensions: BookAnalysisCharacterDimension[];
    }) => generateBookAnalysisCharacterProfile(payload.analysisId, payload.characterId, {
      generationDepth: payload.generationDepth,
      selectedDimensions: payload.selectedDimensions,
    }),
    onMutate: (payload) => {
      setGeneratingCharacterIds((current) => new Set(current).add(payload.characterId));
    },
    onSettled: async (_response, _error, payload) => {
      setGeneratingCharacterIds((current) => {
        const next = new Set(current);
        if (payload) {
          next.delete(payload.characterId);
        }
        return next;
      });
      if (payload) {
        await refreshCharacterData(payload.analysisId);
      }
    },
  });

  const generateAllCandidatesMutation = useMutation({
    mutationFn: (payload: {
      analysisId: string;
      generationDepth: BookAnalysisCharacterGenerationDepth;
      selectedDimensions: BookAnalysisCharacterDimension[];
    }) => generateAllBookAnalysisCharacterCandidates(payload.analysisId, {
      generationDepth: payload.generationDepth,
      selectedDimensions: payload.selectedDimensions,
      includeFailed: true,
    }),
    onSuccess: async (_response, payload) => {
      await refreshCharacterData(payload.analysisId);
    },
  });

  const createCharacterMutation = useMutation({
    mutationFn: (payload: {
      analysisId: string;
      name: string;
      role: string;
      profile?: Partial<CharacterProfile>;
      generationDepth?: BookAnalysisCharacterGenerationDepth;
      selectedDimensions?: BookAnalysisCharacterDimension[];
    }) => createBookAnalysisCharacter(payload.analysisId, {
      name: payload.name,
      role: payload.role,
      profile: payload.profile,
      generationDepth: payload.generationDepth,
      selectedDimensions: payload.selectedDimensions,
    }),
    onSuccess: async (_response, payload) => {
      await refreshCharacterData(payload.analysisId);
    },
  });

  const updateCharacterMutation = useMutation({
    mutationFn: (payload: {
      analysisId: string;
      characterId: string;
      name?: string;
      role?: string;
      profile?: Partial<CharacterProfile>;
      selectedDimensions?: BookAnalysisCharacterDimension[];
    }) => updateBookAnalysisCharacter(payload.analysisId, payload.characterId, {
      name: payload.name,
      role: payload.role,
      profile: payload.profile,
      selectedDimensions: payload.selectedDimensions,
    }),
    onSuccess: async (_response, payload) => {
      await refreshCharacterData(payload.analysisId);
    },
  });

  const deleteCharacterMutation = useMutation({
    mutationFn: (payload: { analysisId: string; characterId: string }) =>
      deleteBookAnalysisCharacter(payload.analysisId, payload.characterId),
    onSuccess: async (_response, payload) => {
      await refreshCharacterData(payload.analysisId);
    },
  });

  const generateCharacters = async (payload: {
    generationDepth: BookAnalysisCharacterGenerationDepth;
    selectedDimensions: BookAnalysisCharacterDimension[];
    characterNames?: string[];
  }) => {
    if (!selectedAnalysis) {
      return;
    }
    await generateCharactersMutation.mutateAsync({
      analysisId: selectedAnalysis.id,
      ...payload,
      characterNames: payload.characterNames?.map((item) => item.trim()).filter(Boolean),
    });
  };

  const createCharacter = async (payload: {
    name: string;
    role: string;
    profile?: Partial<CharacterProfile>;
    generationDepth?: BookAnalysisCharacterGenerationDepth;
    selectedDimensions?: BookAnalysisCharacterDimension[];
  }) => {
    if (!selectedAnalysis) {
      return;
    }
    await createCharacterMutation.mutateAsync({
      analysisId: selectedAnalysis.id,
      ...payload,
    });
  };

  const identifyCharacters = async () => {
    if (!selectedAnalysis) {
      return;
    }
    await identifyCharactersMutation.mutateAsync({
      analysisId: selectedAnalysis.id,
    });
  };

  const generateCharacterProfile = async (
    characterId: string,
    payload: {
      generationDepth: BookAnalysisCharacterGenerationDepth;
      selectedDimensions: BookAnalysisCharacterDimension[];
    },
  ) => {
    if (!selectedAnalysis) {
      return;
    }
    await generateCharacterProfileMutation.mutateAsync({
      analysisId: selectedAnalysis.id,
      characterId,
      ...payload,
    });
  };

  const generateAllCandidates = async (payload: {
    generationDepth: BookAnalysisCharacterGenerationDepth;
    selectedDimensions: BookAnalysisCharacterDimension[];
  }) => {
    if (!selectedAnalysis) {
      return;
    }
    await generateAllCandidatesMutation.mutateAsync({
      analysisId: selectedAnalysis.id,
      ...payload,
    });
  };

  const updateCharacter = async (
    characterId: string,
    payload: {
      name?: string;
      role?: string;
      profile?: Partial<CharacterProfile>;
      selectedDimensions?: BookAnalysisCharacterDimension[];
    },
  ) => {
    if (!selectedAnalysis) {
      return;
    }
    await updateCharacterMutation.mutateAsync({
      analysisId: selectedAnalysis.id,
      characterId,
      ...payload,
    });
  };

  const deleteCharacter = async (characterId: string) => {
    if (!selectedAnalysis) {
      return;
    }
    await deleteCharacterMutation.mutateAsync({
      analysisId: selectedAnalysis.id,
      characterId,
    });
  };

  return {
    characters: charactersQuery.data?.data ?? [],
    generateCharacters,
    identifyCharacters,
    generateCharacterProfile,
    generateAllCandidates,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    pending: {
      loadCharacters: charactersQuery.isLoading,
      generateCharacters: generateCharactersMutation.isPending,
      identifyCharacters: identifyCharactersMutation.isPending,
      generateCharacterProfile: generateCharacterProfileMutation.isPending,
      generateAllCandidates: generateAllCandidatesMutation.isPending,
      generatingCharacterIds,
      createCharacter: createCharacterMutation.isPending,
      updateCharacter: updateCharacterMutation.isPending,
      deleteCharacter: deleteCharacterMutation.isPending,
    },
  };
}
