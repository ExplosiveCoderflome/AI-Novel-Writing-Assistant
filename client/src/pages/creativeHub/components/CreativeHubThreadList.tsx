import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { CreativeHubThread } from "@ai-novel/shared/types/creativeHub";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CreativeHubThreadListProps {
  threads: CreativeHubThread[];
  activeThreadId: string;
  onSelect: (threadId: string) => void;
  onCreate: () => void;
  onArchive: (threadId: string, archived: boolean) => void;
  onDelete: (threadId: string) => void;
}

function toStatusLabel(status: CreativeHubThread["status"]): string {
  if (status === "busy") return t("gen.pages.creativeHub.components.CreativeHubThreadList.gen_d679aea3");
  if (status === "interrupted") return t("gen.pages.creativeHub.components.CreativeHubThreadList.gen_047109de");
  if (status === "error") return t("gen.pages.creativeHub.components.CreativeHubThreadList.gen_c195df63");
  return t("gen.pages.creativeHub.components.CreativeHubThreadList.gen_87bb5bbc");
}

export default function CreativeHubThreadList({
  threads,
  activeThreadId,
  onSelect,
  onCreate,
  onArchive,
  onDelete,
}: CreativeHubThreadListProps) {
  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("gen.pages.creativeHub.components.CreativeHubThreadList.gen_119cfb79")}</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        <Button className="h-9 w-full rounded-xl" onClick={onCreate}>
          新建线程
        </Button>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {threads.map((thread) => (
            <div
              key={thread.id}
              className={`rounded-xl border px-3 py-2.5 ${
                thread.id === activeThreadId ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white"
              }`}
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => onSelect(thread.id)}
              >
                <div className="truncate text-[13px] font-medium text-slate-900">{thread.title}</div>
                <div className="mt-1 text-[11px] leading-4 text-slate-500">
                  {toStatusLabel(thread.status)}
                  {thread.latestRunId ? ` · ${thread.latestRunId.slice(0, 8)}` : ""}
                </div>
              </button>
              <div className="mt-2 flex gap-2 text-[11px]">
                <button
                  type="button"
                  className="rounded-md border border-slate-200 px-2 py-1 text-slate-600 transition hover:bg-slate-100"
                  onClick={() => onArchive(thread.id, !thread.archived)}
                >
                  {thread.archived ? t("gen.pages.creativeHub.components.CreativeHubThreadList.gen_bc83e0c0") : t("gen.pages.creativeHub.components.CreativeHubThreadList.gen_2f51c18f")}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-red-200 px-2 py-1 text-red-600 transition hover:bg-red-50"
                  onClick={() => onDelete(thread.id)}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
          {threads.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
              还没有创作中枢线程。
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
