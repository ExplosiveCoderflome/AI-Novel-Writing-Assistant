import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, BookOpen, Download, Loader2, Settings2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { SimpleCreationShelfChapterStatus } from "@ai-novel/shared/types/novel";
import {
  convertNovelToProfessional,
  downloadNovelExport,
  getSimpleCreationShelf,
} from "@/api/novel";
import { continueNovelWorkflow, getActiveAutoDirectorTask } from "@/api/novelWorkflow";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import LiveExecutionDialog from "@/components/liveExecution/LiveExecutionDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import SimpleCreationMaterialsPanel from "./SimpleCreationMaterialsPanel";
import OnboardingTip from "@/components/onboarding/OnboardingTip";

const STATUS_LABELS: Record<SimpleCreationShelfChapterStatus, string> = {
  waiting_planning: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
  waiting_writing: "waiting to write",
  generating: "Generating",
  reviewing: "Reviewing and repairing",
  completed: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
  error: "abnormal",
};

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function SimpleNovelShelfPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [convertOpen, setConvertOpen] = useState(false);

  const shelfQuery = useQuery({
    queryKey: ["novels", id, "simple-shelf"],
    queryFn: () => getSimpleCreationShelf(id),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.progress.status;
      return status === "running" || status === "queued" ? 3000 : 10000;
    },
  });
  const shelf = shelfQuery.data?.data ?? null;
  const readableChapters = useMemo(
    () => shelf?.chapters.filter((chapter) => chapter.status === "completed" && chapter.content) ?? [],
    [shelf?.chapters],
  );
  const selectedChapter = useMemo(
    () => readableChapters.find((chapter) => chapter.id === selectedChapterId)
      ?? readableChapters.at(-1)
      ?? null,
    [readableChapters, selectedChapterId],
  );

  useEffect(() => {
    if (selectedChapter && selectedChapter.id !== selectedChapterId) {
      setSelectedChapterId(selectedChapter.id);
    }
  }, [selectedChapter, selectedChapterId]);

  useEffect(() => {
    if (shelf?.novel.creationExperience === "professional") {
      navigate(`/novels/${id}/edit`, { replace: true });
    }
  }, [id, navigate, shelf?.novel.creationExperience]);

  const exportMutation = useMutation({
    mutationFn: () => downloadNovelExport(id, "txt", "chapter", shelf?.novel.title),
    onSuccess: ({ blob, fileName }) => saveBlob(blob, fileName),
    onError: () => toast.error("Export failed, please try again later."),
  });

  const retryMutation = useMutation({
    mutationFn: async () => {
      const task = await getActiveAutoDirectorTask(id);
      if (!task.data?.id) {
        throw new Error("No resumable AI tasks found.");
      }
      return continueNovelWorkflow(task.data.id);
    },
    onSuccess: async () => {
      toast.success("AI has continued processing as per current work.");
      await queryClient.invalidateQueries({ queryKey: ["novels", id, "simple-shelf"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Restore failed, please try again."),
  });

  const convertMutation = useMutation({
    mutationFn: () => convertNovelToProfessional(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["novels", id] });
      navigate(`/novels/${id}/edit`, { replace: true }); }, onError: (error) => toast.error(error instanceof Error ? error.message : "Conversion failed, please try again."), }); if (shelfQuery.isPending || !shelf) { return <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Opening chapter bookshelf</div>; } return ( <div className="mx-auto max-w-7xl space-y-5 px-3 py-4 sm:px-4 lg:px-0"> <header className="rounded-2xl border border-border bg-background p-5"> <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"> <div> <Button variant="ghost" size="sm" asChild className="px-0"><Link to="/novels"><ArrowLeft className="h-4 w-4" /> Return to Novel List</Link></Button> <h1 className="mt-2 text-2xl font-semibold text-foreground">{shelf.novel.title}</h1> <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"> ​​<Badge variant="secondary">Easy Creation · Read-Only</Badge> <span>Completed {shelf.progress.completedChapters}/{shelf.progress.totalChapters || "To be planned"} Chapters</span> <span>{shelf.progress.currentAction}</span> </div> </div> <div className="flex flex-wrap gap-2"> <LiveExecutionDialog taskId={shelf.progress.directorTaskId} autoOpenOnActivity /> {shelf.progress.canRetry ? ( <Button onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending}> {retryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Continue according to AI suggestion</Button> ) : null} <Button variant="outline" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}> <Download className="h-4 w-4" /> Export completed chapters</Button> <Button variant="ghost" onClick={() => setConvertOpen(true)}><Settings2 className="h-4 w-4" /> Convert to professional creation</Button> </div> </div> <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted"> <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${shelf.progress.percent}%` }} />
        </div>
        {shelf.progress.safetyMessage ? (
          <div className="mt-4 flex gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm leading-6">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div><div className="font-medium text-foreground">AI has been suspended to protect the work</div><div className="text-muted-foreground">{shelf.progress.safetyMessage}</div></div>
          </div>
        ) : null}
      </header>

      <OnboardingTip
        storageKey="simple-creation-shelf"
        title="Read only completed stable text"
        description="The chapters in production will undergo writing, review and repair, and will not be displayed in advance until they are completed. You can leave the page and the background tasks will continue."
        next="After the first chapter is completed, the bookshelf will automatically highlight the latest manuscript."
      />

      <SimpleCreationMaterialsPanel materials={shelf.materials} />

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-border bg-background p-4 lg:max-h-[calc(100vh-13rem)] lg:overflow-y-auto">
          <div className="mb-3 font-medium text-foreground">Live Chapter Bookshelf</div>
          <div className="space-y-2">
            {shelf.chapters.length === 0 ? <div className="rounded-xl bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">AI is preparing the book plan, and the first batch of chapters will automatically appear here as they appear.</div> : null}
            {shelf.chapters.map((chapter) => {
              const readable = chapter.status === "completed" && Boolean(chapter.content);
              const active = selectedChapter?.id === chapter.id;
              return (
                <button
                  key={chapter.id}
                  type="button"
                  disabled={!readable}
                  onClick={() => setSelectedChapterId(chapter.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${active ? "border-primary bg-primary/5" : "border-border bg-background"} ${readable ? "hover:border-primary/40" : "cursor-default opacity-75"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><div className="text-xs text-muted-foreground">Section {chapter.order} chapter</div><div className="mt-1 truncate text-sm font-medium text-foreground">{chapter.title || "Waiting for naming"}</div></div>
                    <Badge variant={chapter.status === "completed" ? "outline" : chapter.status === "error" ? "destructive" : "secondary"}>{STATUS_LABELS[chapter.status]}</Badge>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
            Quality items to be followed up {shelf.materials.openQualityDebtCount} strip. Common quality issues are continued to be handled by AI and do not interrupt full book production.
                                </div>
        </aside>

        <main className="min-h-[560px] rounded-2xl border border-border bg-background">
          {selectedChapter?.content ? (
            <>
              <div className="border-b border-border px-5 py-4"><div className="text-xs text-muted-foreground">Section {selectedChapter.order} chapter</div><h2 className="mt-1 text-xl font-semibold text-foreground">{selectedChapter.title}</h2></div>
              <article className="mx-auto max-w-3xl whitespace-pre-wrap px-5 py-7 text-base leading-8 text-foreground sm:px-8">{selectedChapter.content}</article>
            </>
          ) : (
            <div className="flex min-h-[560px] items-center justify-center px-6 text-center">
              <div className="max-w-md"><BookOpen className="mx-auto h-10 w-10 text-muted-foreground" /><div className="mt-4 text-lg font-medium text-foreground">Chapter is on the way</div><p className="mt-2 text-sm leading-6 text-muted-foreground">AI will complete the planning first, then write, review and repair chapter by chapter. The completed chapters will automatically appear on the left bookshelf.</p></div>
            </div>
          )}
        </main>
      </div>

      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Turning professionally into creative work?</DialogTitle>
            <DialogDescription>After conversion, settings, planning, and chapter text can be edited, and existing content and background tasks will be retained. This operation cannot switch back to simple creation.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setConvertOpen(false)}>Continue to use simple creation</Button><Button onClick={() => convertMutation.mutate()} disabled={convertMutation.isPending}>{convertMutation.isPending ? "Converting..." : "Confirm to switch to professional creation"}</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
