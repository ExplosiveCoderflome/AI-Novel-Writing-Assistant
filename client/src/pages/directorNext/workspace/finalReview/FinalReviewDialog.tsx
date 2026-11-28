import { useEffect, useState, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { FinalFinding, FinalReview } from "@ai-novel/shared/types/director/finalReview/contract";
import { proseParagraphs } from "@ai-novel/shared/types/director/proseReview/discussion";
import { Dialog, AppDialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ReviewDiscussion } from "../editing/discussion/ReviewDiscussion";
import { applyReviewSuggestions } from "../editing/discussion/draft";
import { readFinalReview, inspectChapter, approveManuscript, downloadFinalManuscript } from "./api";

interface Props {
  novelId: string;
  onClose: () => void;
}
export function FinalReviewDialog(props: Props) {
  const query = useQuery({
    queryKey: ["director-final-review", props.novelId],
    queryFn: () => readFinalReview(props.novelId),
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
  if (query.data) return <ReviewEditor {...props} book={query.data} />;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <AppDialogContent title="全书完稿检查">
        {query.isError ? (
          <>
            <p role="alert">{query.error.message}</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              重新读取
            </Button>
          </>
        ) : (
          <p role="status">正在读取全书稿件…</p>
        )}
      </AppDialogContent>
    </Dialog>
  );
}
function ReviewEditor({ novelId, onClose, book: loaded }: Props & { book: FinalReview }) {
  const [book] = useState(loaded);
  const cache = useQueryClient();
  const [reports, setReports] = useState<Record<string, FinalFinding[] | null>>(() =>
    Object.fromEntries(book.chapters.map((c) => [c.id, c.findings])),
  );
  const [selected, setSelected] = useState(
    () => book.chapters.find((c) => c.findings?.length)?.id ?? book.chapters[0].id,
  );
  const [focus, setFocus] = useState<number | "all">(0);
  const chapter = book.chapters.find((c) => c.id === selected)!;
  const report = reports[selected],
    finding = typeof focus === "number" && report?.[focus] ? focus : "all";
  const form = useMemo(() => proseParagraphs(chapter.content), [chapter.content]);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(book.confirmedVersion);
  const [discard, setDiscard] = useState(false);
  const [checking, setChecking] = useState<number | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const draft = drafts[selected] ?? form.fields;
  const issueKey = JSON.stringify([selected, finding]);
  const edits = useMemo(
    () =>
      book.chapters.flatMap((c) => {
        if (!drafts[c.id]) return [];
        const content = proseParagraphs(c.content).render(drafts[c.id]);
        return content === c.content ? [] : [{ chapterId: c.id, content }];
      }),
    [book, drafts],
  );
  const pending = edits.length > 0 || Object.values(messages).some((value) => value.trim());
  useEffect(() => {
    if (!pending || confirmed) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending, confirmed]);
  const checked = Object.values(reports).filter(Boolean).length,
    complete = checked === book.chapters.length;
  const scan = useMutation({
    mutationFn: async () => {
      try {
        for (const c of book.chapters) {
          if (!mounted.current) break;
          if (reports[c.id] !== null) continue;
          setChecking(c.order);
          const findings = await inspectChapter(novelId, c);
          if (!mounted.current) break;
          setReports((prev) => ({ ...prev, [c.id]: findings }));
        }
      } finally {
        if (mounted.current) setChecking(null);
      }
    },
  });
  const download = useMutation({
    mutationFn: async () => {
      let version = confirmed;
      if (!version) {
        const receipt = await approveManuscript(novelId, { version: book.version, edits });
        version = receipt.confirmedVersion;
        setConfirmed(version);
        void cache.invalidateQueries({ queryKey: ["directorBookWorkspace", novelId] });
      }
      await downloadFinalManuscript(novelId, version);
    },
    onSuccess: onClose,
  });
  const busy = download.isPending;
  function close() {
    if (busy) return;
    if (pending && !confirmed) setDiscard(true);
    else onClose();
  }
  const otherIssues = book.chapters.filter((c) => c.id !== selected && reports[c.id]?.length);
  const nextIssue = otherIssues.find((c) => c.order > chapter.order) ?? otherIssues[0];
  const issueCount = Object.values(reports).reduce((count, items) => count + (items?.length ?? 0), 0);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <AppDialogContent
        title="全书完稿检查"
        description={
          confirmed
            ? "全书确认稿可下载为 TXT。"
            : "逐章核对正文和前后章的衔接。遇到问题可以和助手讨论，保留原文或逐段采纳改法。"
        }
        className="lg:h-[min(50rem,90dvh)] lg:max-w-6xl"
        bodyClassName="grid gap-6 lg:grid-cols-2 lg:overflow-hidden"
        footer={
          <>
            {discard ? (
              <>
                <p className="mr-auto text-sm">放弃尚未确认的段落修改和输入？</p>
                <Button variant="ghost" onClick={() => setDiscard(false)}>
                  继续核对
                </Button>
                <Button variant="outline" onClick={onClose}>
                  放弃并关闭
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={close} disabled={busy}>
                  返回
                </Button>
                {confirmed && book.confirmedVersion === confirmed && (
                  <Button variant="outline" disabled={busy} onClick={() => setConfirmed(null)}>
                    继续核对正文
                  </Button>
                )}
                {confirmed || complete ? (
                  <Button disabled={busy} onClick={() => download.mutate()}>
                    {busy ? "正在准备全书 TXT…" : confirmed ? "下载已确认全书" : "确认稿件并导出全书 TXT"}
                  </Button>
                ) : (
                  <Button disabled={scan.isPending} onClick={() => scan.mutate()}>
                    {scan.isPending ? "正在检查…" : checked || scan.isError ? "继续检查剩余章节" : "开始检查全书"}
                  </Button>
                )}
              </>
            )}
          </>
        }
      >
        <section className="min-w-0 space-y-4 lg:overflow-y-auto lg:pr-3">
          <p role="status" className="text-sm text-muted-foreground">
            {confirmed
              ? `全书共 ${book.chapters.length} 章`
              : `已检查 ${checked} / ${book.chapters.length} 章 · ${issueCount} 项问题`}
            {checking !== null && ` · 正在读第 ${checking} 章`}
          </p>
          {scan.isError && (
            <p role="alert" className="text-sm text-destructive">
              {scan.error.message}
            </p>
          )}
          {download.isError && (
            <p role="alert" className="text-sm text-destructive">
              {download.error.message}
            </p>
          )}
          <label className="grid gap-1 text-sm">
            选择章节
            <select
              disabled={busy}
              className="rounded-md border border-input bg-background px-3 py-2"
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setFocus(0);
              }}
            >
              {book.chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  第 {c.order} 章 · {c.title}
                  {confirmed
                    ? ""
                    : reports[c.id] === null
                      ? " · 待检查"
                      : reports[c.id]?.length
                        ? ` · ${reports[c.id]?.length} 项问题`
                        : " · 未发现问题"}
                </option>
              ))}
            </select>
          </label>
          {nextIssue && !confirmed && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setSelected(nextIssue.id);
                setFocus(0);
              }}
            >
              查看第 {nextIssue.order} 章的问题
            </Button>
          )}
          {report &&
            !confirmed &&
            (report.length ? (
              <fieldset className="space-y-2">
                <legend className="mb-1 font-medium">选择要讨论的问题</legend>
                {report.map((item, i) => (
                  <label key={i} className="flex cursor-pointer items-start gap-2 border-b border-border/40 py-2">
                    <input
                      type="radio"
                      className="mt-1.5"
                      name="final-review-finding"
                      checked={finding === i}
                      disabled={busy}
                      onChange={() => setFocus(i)}
                    />
                    <span className="space-y-1 text-sm">
                      <span className="block font-medium">
                        第 {item.paragraph} 段 · {item.problem}
                      </span>
                      <q className="block text-muted-foreground">{item.quote}</q>
                      <span className="block">{item.advice}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <p className="text-sm">本章未发现需要修改的问题。</p>
            ))}
          <h3 className="font-medium">
            第 {chapter.order} 章 · {chapter.title}
          </h3>
          {Object.entries(draft).map(([key, value]) => (
            <div key={key} className="space-y-1">
              <p className="whitespace-pre-wrap break-words leading-8">{value}</p>
              {value !== form.fields[key] && !confirmed && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    setDrafts((prev) => ({ ...prev, [selected]: { ...prev[selected], [key]: form.fields[key] } }))
                  }
                >
                  撤回第 {key} 段修改
                </Button>
              )}
            </div>
          ))}
        </section>
        {report && !confirmed ? (
          <ReviewDiscussion
            key={issueKey}
            novelId={novelId}
            scope={{ type: "final_review", sourceHash: chapter.sourceHash, finding }}
            subject={{ id: selected, title: `第 ${chapter.order} 章 · ${chapter.title}` }}
            fieldLabels={form.labels}
            base={form.fields}
            draft={draft}
            disabled={busy || discard}
            message={messages[issueKey] ?? ""}
            onMessage={(value) => setMessages((prev) => ({ ...prev, [issueKey]: value }))}
            onAccept={(changes) =>
              setDrafts((prev) => ({
                ...prev,
                [selected]: applyReviewSuggestions(prev[selected] ?? form.fields, form.fields, changes),
              }))
            }
          />
        ) : !confirmed ? (
          <p className="text-sm text-muted-foreground">本章检查完成后，可在这里讨论检查意见。</p>
        ) : null}
      </AppDialogContent>
    </Dialog>
  );
}
