import type {
  DirectorCandidate,
  DirectorCandidateBatch,
  DirectorCorrectionPreset,
} from "@ai-novel/shared/types/novelDirector";

export function toggleDirectorCorrectionPreset(
  presets: DirectorCorrectionPreset[],
  preset: DirectorCorrectionPreset,
): DirectorCorrectionPreset[] {
  return presets.includes(preset)
    ? presets.filter((item) => item !== preset)
    : [...presets, preset];
}

export function applyDirectorCandidateTitleOption(
  batches: DirectorCandidateBatch[],
  batchId: string,
  candidateId: string,
  option: { title: string },
): DirectorCandidateBatch[] {
  return batches.map((batch) => {
    if (batch.id !== batchId) {
      return batch;
    }
    return {
      ...batch,
      candidates: batch.candidates.map((candidate: DirectorCandidate) => {
        if (candidate.id !== candidateId) {
          return candidate;
        }
        const titleOptions = Array.isArray(candidate.titleOptions) ? candidate.titleOptions : [];
        const selectedIndex = titleOptions.findIndex((item) => item.title === option.title);
        const reorderedTitleOptions = selectedIndex <= 0
          ? titleOptions
          : [titleOptions[selectedIndex], ...titleOptions.filter((_, index) => index !== selectedIndex)];
        return {
          ...candidate,
          workingTitle: option.title,
          titleOptions: reorderedTitleOptions,
        };
      }),
    };
  });
}
