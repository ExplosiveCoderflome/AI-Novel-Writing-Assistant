import i18next from "i18next";
import type { RagJobSummary } from "@/api/knowledge";

export function formatStatus(status: string): string {
  switch (status) {
    case "enabled":
      return i18next.t("dict.gen_53ace430");
    case "disabled":
      return i18next.t("dict.gen_69b0f684");
    case "archived":
      return i18next.t("dict.gen_c3ba167c");
    case "idle":
      return i18next.t("dict.gen_87bb5bbc");
    case "queued":
      return i18next.t("tasks.filterStatusQueued");
    case "running":
      return i18next.t("creativeHub.statusBusy");
    case "succeeded":
      return i18next.t("dict.gen_330363df");
    case "failed":
      return i18next.t("tasks.filterStatusFailed");
    default:
      return status;
  }
}

export function getRagJobProgressPercent(job: RagJobSummary): number {
  const raw = job.progress?.percent ?? (job.status === "succeeded" ? 1 : 0);
  return Math.max(0, Math.min(100, Math.round(raw * 100)));
}

export function getRagJobProgressWidth(job: RagJobSummary): string {
  const percent = getRagJobProgressPercent(job);
  if (job.status === "queued" || job.status === "running") {
    return `${Math.max(percent, 6)}%`;
  }
  return `${percent}%`;
}

export function formatRagJobMeta(job: RagJobSummary): string {
  const parts = [job.jobType, i18next.t("knowledge.knowledgeRagUi.cbglk8", { val1: job.attempts, val2: job.maxAttempts })];
  if (job.progress?.current !== undefined && job.progress?.total !== undefined && job.progress.total > 0) {
    parts.push(`${job.progress.current}/${job.progress.total}`);
  }
  if (job.progress?.chunks) {
    parts.push(i18next.t("knowledge.knowledgeRagUi.k8e4u9", { val1: job.progress.chunks }));
  }
  if (job.progress?.documents) {
    parts.push(i18next.t("knowledge.knowledgeRagUi.k8hjn0", { val1: job.progress.documents }));
  }
  return parts.join(" | ");
}
