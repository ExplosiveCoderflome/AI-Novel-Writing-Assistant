export interface ActivePipelineJobCandidate {
  id: string;
  completedCount: number | null;
  progress: number | null;
}

function normalizeMetric(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function selectPrimaryPipelineJob<T extends ActivePipelineJobCandidate>(
  jobs: T[],
  preferredJobId?: string | null,
): T {
  const bestJob = jobs[0];
  if (!preferredJobId) {
    return bestJob;
  }

  const preferredJob = jobs.find((job) => job.id === preferredJobId);
  if (!preferredJob) {
    return bestJob;
  }
  if (preferredJob.id === bestJob.id) {
    return preferredJob;
  }

  const preferredCompleted = normalizeMetric(preferredJob.completedCount);
  const bestCompleted = normalizeMetric(bestJob.completedCount);
  const preferredProgress = normalizeMetric(preferredJob.progress);
  const bestProgress = normalizeMetric(bestJob.progress);

  if (preferredCompleted === bestCompleted && preferredProgress === bestProgress) {
    return preferredJob;
  }
  return bestJob;
}
