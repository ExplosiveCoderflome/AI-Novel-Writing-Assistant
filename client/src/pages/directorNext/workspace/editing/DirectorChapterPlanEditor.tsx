import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { VolumeChapterPlan } from "@ai-novel/shared/types/novel";
import {
  chapterReviewForm,
  chapterEditFromDraft,
  changedSceneBudget,
  sceneFields,
  sceneFieldKey,
  sceneFieldLabels,
} from "@ai-novel/shared/types/director/chapterReview/discussion";
import type { ChapterPlanEdit } from "@ai-novel/shared/types/director/revision";
import { createDirectorCommandKey, submitDirectorCommand } from "@/api/directorNext";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { applyReviewSuggestions } from "./discussion/draft";
import { ReviewDiscussion } from "./discussion/ReviewDiscussion";

interface Props {
  novelId: string;
  runId: string;
  expectedVersion: number;
  plans: VolumeChapterPlan[];
  activeVersionId?: string | null;
  approvalFingerprint?: string;
  onClose: () => void;
}
const chapterTitle = (plan: VolumeChapterPlan) => `第 ${plan.chapterOrder} 章 · ${plan.title}`;

export function DirectorChapterPlanEditor({
  novelId,
  runId,
  expectedVersion,
  plans,
  activeVersionId,
  approvalFingerprint,
  onClose,
}: Props) {
  const queries = useQueryClient();
  const [opened] = useState(() => plans.map((plan) => ({ plan, form: chapterReviewForm(plan) })));
  const [planVersionId] = useState(activeVersionId);
  const [approveForProse] = useState(approvalFingerprint);
  const [selectedId, setSelectedId] = useState(opened[0].plan.id);
  const { plan, form } = opened.find((item) => item.plan.id === selectedId)!;
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [discarding, setDiscarding] = useState(false);
  const request = useRef({ body: "", key: "" });
  const draft = drafts[selectedId] ?? form.fields;
  const sceneTotal = changedSceneBudget(form, draft);
  const changed = opened.filter(
    ({ plan, form }) =>
      drafts[plan.id] && Object.entries(drafts[plan.id]).some(([key, value]) => value !== form.fields[key]),
  );
  const unsaved = changed.length > 0 || Object.values(messages).some((text) => text.trim());
  const stale = activeVersionId !== planVersionId;
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);
  const mutation = useMutation({
    mutationFn: async () => {
      const chapters: { chapterId: string; edit: ChapterPlanEdit }[] = [];
      for (const { plan, form } of changed) {
        const parsed = chapterEditFromDraft(form, drafts[plan.id]);
        if (!parsed.success) {
          setSelectedId(plan.id);
          throw new Error(
            `第 ${plan.chapterOrder} 章：${parsed.error.issues[0]?.message ?? "请检查任务、场景与字数。"}`,
          );
        }
        chapters.push({ chapterId: plan.id, edit: parsed.data });
      }
      if (chapters.length && !planVersionId) throw new Error("请重新打开本章的卷规划后再保存修改。");
      const chapterPlanEdit =
        planVersionId && (chapters.length || approveForProse)
          ? { planVersionId, chapters, approveForProse }
          : undefined;
      const body = JSON.stringify(chapterPlanEdit ?? null);
      if (request.current.body !== body) request.current = { body, key: createDirectorCommandKey() };
      return submitDirectorCommand({
        type: "resolve_gate",
        runId,
        expectedVersion,
        decision: chapters.length ? "confirm_after_edit" : "confirm",
        chapterPlanEdit,
        idempotencyKey: request.current.key,
      });
    },
    onSuccess: async () => {
      await Promise.all(
        [
          ["directorBookWorkspace", novelId],
          queryKeys.directorNext.summary(novelId),
          queryKeys.directorNext.detail(novelId),
        ].map((queryKey) => queries.invalidateQueries({ queryKey })),
      );
      onClose();
    },
  });
  const disabled = mutation.isPending || discarding || stale;
  function close() {
    if (!mutation.isPending) {
      if (unsaved) setDiscarding(true);
      else onClose();
    }
  }
  function change(key: string, value: string) {
    setDrafts((previous) => ({
      ...previous,
      [selectedId]: { ...(previous[selectedId] ?? form.fields), [key]: value },
    }));
  }
  function field(key: string, label: string, options: { words?: boolean; rows?: number; max?: number } = {}) {
    return (
      <label key={key} className="grid gap-1 text-sm">
        <span>{label}</span>
        {options.words ? (
          <Input
            type="number"
            min={key === "targetWordCount" ? 200 : 1}
            max={20000}
            value={draft[key]}
            disabled={disabled}
            onChange={(event) => change(key, event.target.value)}
          />
        ) : (
          <textarea
            className="rounded-md border border-input bg-background px-3 py-2 focus-visible:ring-2 focus-visible:ring-ring"
            rows={options.rows ?? 2}
            maxLength={options.max ?? 12000}
            value={draft[key]}
            disabled={disabled}
            onChange={(event) => change(key, event.target.value)}
          />
        )}
      </label>
    );
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <AppDialogContent
        title="讨论与编辑章节任务和场景"
        description="选一章讨论或手改。确认前可以切换章节，最后一起保存。"
        className="lg:h-[min(48rem,90dvh)] lg:max-w-6xl"
        bodyClassName="grid gap-5 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:overflow-hidden"
        footer={
          discarding ? (
            <>
              <p className="mr-auto text-sm">关闭会放弃未保存的修改。</p>
              <Button variant="ghost" onClick={() => setDiscarding(false)}>
                继续编辑
              </Button>
              <Button variant="outline" onClick={onClose}>
                放弃修改并关闭
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" disabled={mutation.isPending} onClick={close}>
                取消
              </Button>
              <Button disabled={disabled} onClick={() => mutation.mutate()}>
                {mutation.isPending
                  ? "正在确认…"
                  : approveForProse
                    ? "确认本批章节并继续写正文"
                    : changed.length
                      ? "保存修改并继续"
                      : "确认本批章节并继续"}
              </Button>
            </>
          )
        }
      >
        <div className="min-w-0 space-y-4 lg:overflow-y-auto lg:pr-2">
          {opened.length > 1 ? (
            <label className="grid gap-1 text-sm">
              选择章节
              <select
                className="rounded-md border border-input bg-background px-3 py-2"
                value={selectedId}
                disabled={mutation.isPending}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {opened.map(({ plan }) => (
                  <option key={plan.id} value={plan.id}>
                    {chapterTitle(plan)}
                    {changed.some((row) => row.plan.id === plan.id) ? " · 待保存" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <h3 className="font-medium">{chapterTitle(plan)}</h3>
          )}
          {field("taskSheet", "章节任务", { rows: 5 })}
          <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
            {field("targetWordCount", "目标字数", { words: true })}
            {field("mustAvoid", "需要避免", { max: 4000 })}
          </div>
          {sceneTotal !== null && sceneTotal !== Number(draft.targetWordCount) && (
            <div className="flex flex-wrap items-center gap-2 text-sm" role="status">
              场景合计 {sceneTotal} 字，需与章节目标一致。
              <Button
                size="sm"
                variant="outline"
                disabled={disabled || sceneTotal < 200 || sceneTotal > 20000}
                onClick={() => change("targetWordCount", String(sceneTotal))}
              >
                使用场景合计
              </Button>
            </div>
          )}
          {sceneTotal === null && draft.targetWordCount !== form.fields.targetWordCount && (
            <p className="text-sm text-muted-foreground">保存时会按各场景原有比例分配章节目标字数。</p>
          )}
          {form.scenePlan?.scenes.map((scene, index) => (
            <details
              key={JSON.stringify([selectedId, scene.key])}
              open={index === 0}
              className="border-t border-border/40 pt-3"
            >
              <summary className="cursor-pointer font-medium">
                场景 {index + 1} · {draft[sceneFieldKey(scene.key, "title")]}
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {sceneFields.map((name) =>
                  field(sceneFieldKey(scene.key, name), sceneFieldLabels[name], { words: name === "targetWordCount" }),
                )}
              </div>
            </details>
          )) ?? (
            <p role="alert" className="text-sm text-destructive">
              场景内容不完整，可返回导演台重新生成本阶段。
            </p>
          )}
          {stale && (
            <p role="alert" className="text-sm text-destructive">
              卷规划版本有变化，请关闭后重新打开。
            </p>
          )}
          {mutation.isError && (
            <p role="alert" className="text-sm text-destructive">
              {mutation.error.message}
            </p>
          )}
        </div>
        {planVersionId && form.scenePlan && (
          <ReviewDiscussion
            key={selectedId}
            novelId={novelId}
            runId={runId}
            version={expectedVersion}
            scope={{ type: "chapter_task_sheet", planVersionId }}
            subject={{ id: selectedId, title: chapterTitle(plan) }}
            fieldLabels={form.labels}
            base={form.fields}
            draft={draft}
            disabled={disabled}
            message={messages[selectedId] ?? ""}
            onMessage={(value) => setMessages((previous) => ({ ...previous, [selectedId]: value }))}
            onAccept={(items) =>
              setDrafts((previous) => {
                return {
                  ...previous,
                  [selectedId]: applyReviewSuggestions(previous[selectedId] ?? form.fields, form.fields, items),
                };
              })
            }
          />
        )}
      </AppDialogContent>
    </Dialog>
  );
}
