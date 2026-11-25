import { apiClient } from "@/api/client";
import { extractFileName } from "@/api/novel/shared";
import type {
  FinalReview,
  FinalFinding,
  FinalApproval,
  FinalChapter,
} from "@ai-novel/shared/types/director/finalReview/contract";
const inline = { errorPresentation: "inline" } as const;
const path = (id: string) => `/director-next/novels/${encodeURIComponent(id)}/final-review`;
export async function readFinalReview(id: string) {
  return (await apiClient.get<{ data: FinalReview }>(path(id), inline)).data.data;
}
export async function inspectChapter(id: string, chapter: FinalChapter) {
  return (
    await apiClient.post<{ data: FinalFinding[] }>(
      `${path(id)}/chapters/${encodeURIComponent(chapter.id)}/${chapter.sourceHash}/inspect`,
      {},
      inline,
    )
  ).data.data;
}
export async function approveManuscript(id: string, input: FinalApproval) {
  return (await apiClient.post<{ data: { confirmedVersion: string } }>(path(id) + "/confirm", input, inline)).data.data;
}
export async function downloadFinalManuscript(id: string, version: string) {
  const response = await apiClient.get<string>(path(id) + "/exports/" + version, inline);
  const url = URL.createObjectURL(new Blob([response.data], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = extractFileName(response.headers["content-disposition"], "全书确认稿.txt");
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
