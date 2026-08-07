import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Save } from "lucide-react";
import type { NarrativeForm } from "@ai-novel/shared/types/creationStudio";
import type { WritingPlatform, WritingPlatformGuidance, WritingPlatformProfileDefinition } from "@ai-novel/shared/types/writingPlatform";
import {
  activateWritingPlatformProfileVersion,
  getWritingPlatformProfile,
  restoreOfficialWritingPlatformProfile,
  saveWritingPlatformProfile,
} from "@/api/promptWorkbench";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const PLATFORMS: Array<{ key: WritingPlatform; label: string }> = [
  { key: "fanqie_free", label: "番茄免费网文" },
  { key: "qidian_male", label: "起点男频" },
  { key: "jinjiang_female", label: "晋江女频" },
  { key: "zhihu_story", label: "知乎短故事" },
];

const GUIDANCE_FIELDS: Array<{ key: keyof WritingPlatformGuidance; label: string }> = [
  { key: "positioning", label: "作品定位" },
  { key: "planning", label: "规划指导" },
  { key: "drafting", label: "正文指导" },
  { key: "auditing", label: "审校指导" },
  { key: "repairing", label: "修复指导" },
];

export function WritingPlatformProfileManager(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [platform, setPlatform] = useState<WritingPlatform>("fanqie_free");
  const [draft, setDraft] = useState<WritingPlatformProfileDefinition | null>(null);
  const [notes, setNotes] = useState("");
  const query = useQuery({
    queryKey: ["prompt-workbench", "writing-platform", platform],
    queryFn: () => getWritingPlatformProfile(platform),
    enabled: props.open,
  });
  const detail = query.data?.data ?? null;
  useEffect(() => { if (detail) setDraft(structuredClone(detail.profile)); }, [detail]);

  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["prompt-workbench", "writing-platform", platform] });
  const saveMutation = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error("平台写法尚未加载。");
      return saveWritingPlatformProfile(platform, draft, notes);
    },
    onSuccess: async () => { await refresh(); setNotes(""); toast.success("平台写法已保存为新版本。"); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "保存失败。"),
  });
  const restoreMutation = useMutation({
    mutationFn: () => restoreOfficialWritingPlatformProfile(platform),
    onSuccess: async () => { await refresh(); toast.success("已恢复官方平台写法。"); },
  });
  const activateMutation = useMutation({
    mutationFn: (versionId: string) => activateWritingPlatformProfileVersion(platform, versionId),
    onSuccess: async () => { await refresh(); toast.success("平台写法版本已启用。"); },
  });

  function updateGuidance(form: NarrativeForm, key: keyof WritingPlatformGuidance, value: string) {
    setDraft((current) => {
      if (!current || !current.guidance[form]) return current;
      return { ...current, guidance: { ...current.guidance, [form]: { ...current.guidance[form]!, [key]: value } } };
    });
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="flex h-[88vh] w-[min(1280px,94vw)] max-w-none flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>平台写法</DialogTitle>
          <DialogDescription>同一套生产链会按这里的版本调整定位、规划、正文、审校和修复。已有作品继续使用创建时保存的快照。</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 md:grid-cols-[220px_minmax(0,1fr)_260px]">
          <nav className="space-y-1 border-r bg-muted/20 p-3">
            {PLATFORMS.map((item) => (
              <button key={item.key} type="button" onClick={() => setPlatform(item.key)} className={cn("w-full rounded-lg px-3 py-2.5 text-left text-sm", item.key === platform ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:bg-background/70")}>{item.label}</button>
            ))}
          </nav>
          <main className="min-h-0 overflow-y-auto p-5">
            {!draft ? <div className="text-sm text-muted-foreground">正在读取平台写法…</div> : (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm">名称<Input className="mt-2" value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} /></label>
                  <label className="text-sm">版本说明<Input className="mt-2" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="说明这次希望改善的读感" /></label>
                </div>
                <label className="block text-sm">平台说明<textarea className="mt-2 min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></label>
                {draft.supportedNarrativeForms.map((form) => (
                  <section key={form} className="space-y-3 rounded-xl border p-4">
                    <h3 className="font-medium">{form === "long_novel" ? "长篇写法" : "短篇写法"}</h3>
                    {GUIDANCE_FIELDS.map((field) => (
                      <label key={field.key} className="block text-sm text-muted-foreground">{field.label}
                        <textarea className="mt-1.5 min-h-24 w-full rounded-md border bg-background p-3 text-sm leading-6 text-foreground" value={draft.guidance[form]?.[field.key] ?? ""} onChange={(event) => updateGuidance(form, field.key, event.target.value)} />
                      </label>
                    ))}
                  </section>
                ))}
              </div>
            )}
          </main>
          <aside className="min-h-0 overflow-y-auto border-l bg-muted/15 p-4">
            <div className="text-sm font-medium">当前状态</div>
            <div className="mt-2 text-xs leading-6 text-muted-foreground">{detail?.source === "custom" ? `自定义版本 ${detail.activeVersion}` : `官方版本 ${detail?.activeVersion ?? "-"}`}</div>
            <div className="mt-5 space-y-2">
              {(detail?.versions ?? []).map((version) => (
                <button key={version.id} type="button" onClick={() => activateMutation.mutate(version.id)} className={cn("w-full rounded-lg border p-3 text-left text-xs", version.active && "border-primary bg-primary/5")}>
                  <div className="font-medium">版本 {version.versionNo}{version.active ? " · 使用中" : ""}</div>
                  <div className="mt-1 text-muted-foreground">{version.notes || "无版本说明"}</div>
                </button>
              ))}
            </div>
          </aside>
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <Button variant="outline" onClick={() => restoreMutation.mutate()} disabled={restoreMutation.isPending}><RotateCcw className="mr-2 h-4 w-4" />恢复官方写法</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!draft || saveMutation.isPending}><Save className="mr-2 h-4 w-4" />保存新版本</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

