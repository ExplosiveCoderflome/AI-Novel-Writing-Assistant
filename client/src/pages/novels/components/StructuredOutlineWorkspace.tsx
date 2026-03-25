import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import WorldInjectionHint from "./WorldInjectionHint";
import type { StructuredTabViewProps } from "./NovelEditView.types";

const textareaClassName =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function shortText(value: string | null | undefined, fallback: string, limit = 60) {
  const text = (value ?? "").trim();
  if (!text) return fallback;
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function hasChapterDraftContent(volume: StructuredTabViewProps["volumes"][number] | undefined) {
  if (!volume) return false;
  return volume.chapters.some((chapter) => (
    chapter.summary.trim().length > 0
    || chapter.title.trim() !== `第${chapter.chapterOrder}章`
  ));
}

function actionLabel(action: StructuredTabViewProps["syncPreview"]["items"][number]["action"]) {
  if (action === "create") return "新增";
  if (action === "update") return "更新";
  if (action === "move") return "移动";
  if (action === "keep") return "保留";
  if (action === "delete") return "删除";
  return "待删候选";
}

function actionVariant(
  action: StructuredTabViewProps["syncPreview"]["items"][number]["action"],
): "default" | "secondary" | "outline" {
  if (action === "create") return "default";
  if (action === "delete" || action === "delete_candidate") return "secondary";
  return "outline";
}

export default function StructuredOutlineWorkspace(props: StructuredTabViewProps) {
  const {
    worldInjectionSummary,
    hasCharacters,
    hasUnsavedVolumeDraft,
    generationNotice,
    isGeneratingBook,
    onGenerateBook,
    isGeneratingVolume,
    onGenerateVolume,
    isGeneratingChapterDetail,
    generatingChapterDetailMode,
    generatingChapterDetailChapterId,
    onGenerateChapterDetail,
    onGoToCharacterTab,
    volumes,
    draftText,
    syncPreview,
    syncOptions,
    onSyncOptionsChange,
    onApplySync,
    isApplyingSync,
    syncMessage,
    onVolumeFieldChange,
    onOpenPayoffsChange,
    onChapterFieldChange,
    onChapterNumberChange,
    onChapterPayoffRefsChange,
    onAddChapter,
    onRemoveChapter,
    onMoveChapter,
    onApplyBatch,
    onSave,
    isSaving,
  } = props;

  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [showSyncPreview, setShowSyncPreview] = useState(false);
  const [showVolumeEditor, setShowVolumeEditor] = useState(false);
  const [batchConflictLevel, setBatchConflictLevel] = useState(60);
  const [batchWordCount, setBatchWordCount] = useState(2500);
  const [selectedVolumeId, setSelectedVolumeId] = useState(volumes[0]?.id ?? "");
  const [selectedChapterId, setSelectedChapterId] = useState(volumes[0]?.chapters[0]?.id ?? "");

  useEffect(() => {
    if (!volumes.some((volume) => volume.id === selectedVolumeId)) {
      setSelectedVolumeId(volumes[0]?.id ?? "");
    }
  }, [volumes, selectedVolumeId]);

  const selectedVolume = volumes.find((volume) => volume.id === selectedVolumeId) ?? volumes[0];

  useEffect(() => {
    const chapters = selectedVolume?.chapters ?? [];
    if (!chapters.some((chapter) => chapter.id === selectedChapterId)) {
      setSelectedChapterId(chapters[0]?.id ?? "");
    }
  }, [selectedChapterId, selectedVolume]);

  const selectedChapter = selectedVolume?.chapters.find((chapter) => chapter.id === selectedChapterId) ?? selectedVolume?.chapters[0];
  const selectedChapterIndex = selectedVolume && selectedChapter
    ? selectedVolume.chapters.findIndex((chapter) => chapter.id === selectedChapter.id)
    : -1;
  const totalChapterCount = volumes.reduce((sum, volume) => sum + volume.chapters.length, 0);
  const changedChapterCount = syncPreview.createCount + syncPreview.updateCount + syncPreview.moveCount + syncPreview.deleteCount;
  const activeVolumeWordTarget = selectedVolume?.chapters.reduce(
    (sum, chapter) => sum + (typeof chapter.targetWordCount === "number" ? chapter.targetWordCount : 0),
    0,
  ) ?? 0;
  const currentVolumeActionLabel = hasChapterDraftContent(selectedVolume) ? "重写当前卷章节列表" : "生成当前卷章节列表";

  const handleApplySync = () => {
    if (syncOptions.applyDeletes && syncPreview.deleteCount > 0) {
      const confirmed = window.confirm(`将删除 ${syncPreview.deleteCount} 个章节，是否继续？`);
      if (!confirmed) return;
    }
    if (!syncOptions.preserveContent && syncPreview.clearContentCount > 0) {
      const confirmed = window.confirm(`将清空 ${syncPreview.clearContentCount} 个已有正文章节内容，是否继续？`);
      if (!confirmed) return;
    }
    onApplySync(syncOptions);
  };

  if (volumes.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-1">
            <CardTitle>卷纲 / 章纲联动工作台</CardTitle>
            <div className="text-sm text-muted-foreground">先生成全书卷骨架，再按卷拆章节列表，最后按需细化单章字段。</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onGenerateBook} disabled={isGeneratingBook}>
              {isGeneratingBook ? "生成中..." : "生成全书卷骨架"}
            </Button>
            <Button variant="secondary" onClick={onSave} disabled={isSaving}>{isSaving ? "保存中..." : "保存卷纲/章纲"}</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />
          {!hasCharacters ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <span>请先补角色，再拆卷纲和章纲。</span>
              <Button size="sm" variant="outline" onClick={onGoToCharacterTab}>去角色管理</Button>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
            <span>{generationNotice}</span>
            {hasUnsavedVolumeDraft ? <Badge variant="secondary">含未保存草稿</Badge> : null}
          </div>
          <div className="rounded-xl border border-dashed border-border/70 p-8 text-sm text-muted-foreground">
            当前还没有卷纲/章纲。可以先点击“生成全书卷骨架”，这一步只定卷级骨架；章节列表需要后续按卷生成。
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="space-y-1">
          <CardTitle>卷纲 / 章纲联动工作台</CardTitle>
          <div className="text-sm text-muted-foreground">先定卷级骨架，再为当前卷生成章节列表，最后按需补章节目标、执行边界和任务单。</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onGenerateBook} disabled={isGeneratingBook}>
            {isGeneratingBook ? "生成中..." : "重生成全书卷骨架"}
          </Button>
          {selectedVolume ? (
            <Button onClick={() => onGenerateVolume(selectedVolume.id)} disabled={isGeneratingVolume}>
              {isGeneratingVolume ? "生成中..." : currentVolumeActionLabel}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onSave} disabled={isSaving}>{isSaving ? "保存中..." : "保存卷纲/章纲"}</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />
        {!hasCharacters ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <span>请先补角色，再拆卷纲和章纲。</span>
            <Button size="sm" variant="outline" onClick={onGoToCharacterTab}>去角色管理</Button>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
          <span>{generationNotice}</span>
          {hasUnsavedVolumeDraft ? <Badge variant="secondary">含未保存草稿</Badge> : null}
        </div>
        {syncMessage ? <div className="text-xs text-muted-foreground">{syncMessage}</div> : null}

        <div className="grid gap-3 xl:grid-cols-[1.2fr_1fr_1fr]">
          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">共 {volumes.length} 卷</Badge>
              <Badge variant="outline">{totalChapterCount} 章</Badge>
              {selectedVolume ? <Badge variant="secondary">当前：第{selectedVolume.sortOrder}卷</Badge> : null}
            </div>
            <div className="mt-3 text-lg font-semibold text-foreground">
              {selectedChapter ? `正在打磨：第${selectedChapter.chapterOrder}章《${selectedChapter.title || "未命名章节"}》` : "先从左侧选中一章"}
            </div>
            <div className="mt-2 text-sm leading-6 text-muted-foreground">先看卷承诺，再生成章节列表；章节目标、执行边界和任务单改成单独按需生成，避免一次塞太多上下文。</div>
          </div>
          <div className={cn("rounded-xl border p-3", changedChapterCount > 0 ? "border-amber-300/60 bg-amber-50/80" : "border-border/70 bg-background/80")}>
            <div className="text-xs text-muted-foreground">待同步改动</div>
            <div className="mt-1 text-lg font-semibold">{changedChapterCount}</div>
            <div className="mt-1 text-xs text-muted-foreground">新增 {syncPreview.createCount} / 更新 {syncPreview.updateCount} / 移动 {syncPreview.moveCount} / 删除 {syncPreview.deleteCount}</div>
          </div>
          <div className={cn("rounded-xl border p-3", !syncOptions.preserveContent && syncPreview.clearContentCount > 0 ? "border-amber-300/60 bg-amber-50/80" : "border-border/70 bg-background/80")}>
            <div className="text-xs text-muted-foreground">受影响正文</div>
            <div className="mt-1 text-lg font-semibold">{syncPreview.affectedGeneratedCount}</div>
            <div className="mt-1 text-xs text-muted-foreground">{syncOptions.preserveContent ? "当前设置会保留已有正文" : `其中 ${syncPreview.clearContentCount} 章可能清空正文`}</div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">卷导航</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {volumes.map((volume) => (
                  <button
                    key={volume.id}
                    type="button"
                    onClick={() => { setSelectedVolumeId(volume.id); setSelectedChapterId(volume.chapters[0]?.id ?? ""); }}
                    className={cn("w-full rounded-xl border p-3 text-left transition-colors", selectedVolume?.id === volume.id ? "border-primary/50 bg-primary/5 shadow-sm" : "border-border/70 bg-background hover:border-primary/30 hover:bg-muted/20")}
                  >
                    <div className="flex items-center justify-between gap-2"><Badge variant={selectedVolume?.id === volume.id ? "default" : "outline"}>第{volume.sortOrder}卷</Badge><span className="text-xs text-muted-foreground">{volume.chapters.length} 章</span></div>
                    <div className="mt-2 text-sm font-medium text-foreground">{volume.title}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{shortText(volume.mainPromise || volume.summary, "先补这卷的核心承诺或摘要。")}</div>
                  </button>
                ))}
              </CardContent>
            </Card>

            {selectedVolume ? (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">本卷章节</CardTitle>
                    <Button size="sm" variant="outline" onClick={() => onAddChapter(selectedVolume.id)}>新增章节</Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="max-h-[52vh] space-y-2 overflow-auto pr-1">
                    {selectedVolume.chapters.map((chapter, index) => (
                      <button
                        key={chapter.id}
                        type="button"
                        onClick={() => setSelectedChapterId(chapter.id)}
                        className={cn("w-full rounded-xl border p-3 text-left transition-colors", selectedChapter?.id === chapter.id ? "border-sky-400/70 bg-sky-50 shadow-sm" : "border-border/70 bg-background hover:border-sky-300/60 hover:bg-muted/20")}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2"><Badge variant={selectedChapter?.id === chapter.id ? "default" : "secondary"}>第{chapter.chapterOrder}章</Badge><span className="text-[11px] text-muted-foreground">卷内 {index + 1}</span></div>
                          {chapter.taskSheet?.trim() ? <Badge variant="outline">有任务单</Badge> : null}
                        </div>
                        <div className="mt-2 text-sm font-medium text-foreground">{chapter.title || `第${chapter.chapterOrder}章`}</div>
                        <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{shortText(chapter.summary || chapter.purpose, "先写一句这章发生什么。")}</div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">同步与批量工具</CardTitle>
                    <div className="text-sm text-muted-foreground">章节列表确认后，再决定是否批量补规则任务单并同步到章节执行。</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setShowSyncPreview((value) => !value)}>{showSyncPreview ? "隐藏同步差异" : "查看同步差异"}</Button>
                    <Button onClick={handleApplySync} disabled={isApplyingSync}>{isApplyingSync ? "同步中..." : "同步到章节执行"}</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <div className="rounded-xl border border-border/70 bg-background/70 p-3"><div className="text-xs text-muted-foreground">批量设置冲突等级</div><div className="mt-2 flex flex-wrap items-center gap-2"><Input className="w-24" type="number" min={0} max={100} value={batchConflictLevel} onChange={(event) => setBatchConflictLevel(Number(event.target.value || 0))} /><Button size="sm" variant="outline" onClick={() => onApplyBatch({ conflictLevel: batchConflictLevel })}>应用到全部章纲</Button></div></div>
                  <div className="rounded-xl border border-border/70 bg-background/70 p-3"><div className="text-xs text-muted-foreground">批量设置目标字数</div><div className="mt-2 flex flex-wrap items-center gap-2"><Input className="w-28" type="number" min={200} step={100} value={batchWordCount} onChange={(event) => setBatchWordCount(Number(event.target.value || 200))} /><Button size="sm" variant="outline" onClick={() => onApplyBatch({ targetWordCount: batchWordCount })}>应用到全部章纲</Button></div></div>
                  <div className="flex items-end"><Button variant="outline" onClick={() => onApplyBatch({ generateTaskSheet: true })}>批量补任务单（规则）</Button></div>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <label className="flex items-center gap-2 rounded-full border border-border/70 px-3 py-1.5"><input type="checkbox" checked={syncOptions.preserveContent} onChange={(event) => onSyncOptionsChange({ preserveContent: event.target.checked })} />保留已有正文</label>
                  <label className="flex items-center gap-2 rounded-full border border-border/70 px-3 py-1.5"><input type="checkbox" checked={syncOptions.applyDeletes} onChange={(event) => onSyncOptionsChange({ applyDeletes: event.target.checked })} />同步时删除卷纲外章节</label>
                </div>
                {showSyncPreview ? <div className="max-h-64 space-y-2 overflow-auto rounded-xl border border-border/70 bg-muted/20 p-3 text-xs">{syncPreview.items.map((item) => <div key={`${item.action}-${item.chapterOrder}-${item.nextTitle}`} className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-background/80 p-2.5"><div className="space-y-1"><div className="font-medium text-foreground">第{item.chapterOrder}章：{item.previousTitle && item.previousTitle !== item.nextTitle ? `${item.previousTitle} -> ${item.nextTitle}` : item.nextTitle}</div><div className="text-muted-foreground">所属卷：{item.volumeTitle}</div>{item.changedFields.length > 0 ? <div className="text-muted-foreground">字段：{item.changedFields.join("、")}</div> : null}</div><div className="flex shrink-0 items-center gap-1">{item.hasContent ? <Badge variant="outline">有正文</Badge> : null}<Badge variant={actionVariant(item.action)}>{actionLabel(item.action)}</Badge></div></div>)}</div> : null}
              </CardContent>
            </Card>

            {selectedVolume ? (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">第{selectedVolume.sortOrder}卷</Badge><Badge variant="secondary">{selectedVolume.chapters.length} 章</Badge><Badge variant="outline">预计 {activeVolumeWordTarget || "未设"} 字</Badge></div>
                      <CardTitle className="text-xl">{selectedVolume.title}</CardTitle>
                      <div className="text-sm text-muted-foreground">这卷的承诺、高潮和钩子，是判断当前章节有没有跑偏的参照物。</div>
                    </div>
                    <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setShowVolumeEditor((value) => !value)}>{showVolumeEditor ? "收起卷设定" : "微调当前卷"}</Button><Button size="sm" variant="outline" onClick={() => onAddChapter(selectedVolume.id)}>新增本卷章节</Button></div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-5">
                    <div className="rounded-xl border border-border/70 bg-background/70 p-3"><div className="text-xs text-muted-foreground">卷摘要</div><div className="mt-2 text-sm leading-6 text-foreground">{selectedVolume.summary || "未填写"}</div></div>
                    <div className="rounded-xl border border-border/70 bg-background/70 p-3"><div className="text-xs text-muted-foreground">主承诺</div><div className="mt-2 text-sm leading-6 text-foreground">{selectedVolume.mainPromise || "未填写"}</div></div>
                    <div className="rounded-xl border border-border/70 bg-background/70 p-3"><div className="text-xs text-muted-foreground">卷末高潮</div><div className="mt-2 text-sm leading-6 text-foreground">{selectedVolume.climax || "未填写"}</div></div>
                    <div className="rounded-xl border border-border/70 bg-background/70 p-3"><div className="text-xs text-muted-foreground">下卷钩子</div><div className="mt-2 text-sm leading-6 text-foreground">{selectedVolume.nextVolumeHook || "未填写"}</div></div>
                    <div className="rounded-xl border border-border/70 bg-background/70 p-3"><div className="text-xs text-muted-foreground">未兑现事项</div><div className="mt-2 text-sm leading-6 text-foreground">{selectedVolume.openPayoffs.join("、") || "暂无挂起兑现点"}</div></div>
                  </div>
                  {showVolumeEditor ? <div className="grid gap-4 rounded-2xl border border-border/70 bg-muted/20 p-4 xl:grid-cols-2"><label className="space-y-2 text-sm xl:col-span-2"><span className="text-xs text-muted-foreground">卷标题</span><Input value={selectedVolume.title} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "title", event.target.value)} /></label><label className="space-y-2 text-sm xl:col-span-2"><span className="text-xs text-muted-foreground">卷摘要</span><textarea className={cn(textareaClassName, "min-h-[120px]")} value={selectedVolume.summary ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "summary", event.target.value)} /></label><label className="space-y-2 text-sm"><span className="text-xs text-muted-foreground">主承诺</span><textarea className={cn(textareaClassName, "min-h-[112px]")} value={selectedVolume.mainPromise ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "mainPromise", event.target.value)} /></label><label className="space-y-2 text-sm"><span className="text-xs text-muted-foreground">卷末高潮</span><textarea className={cn(textareaClassName, "min-h-[112px]")} value={selectedVolume.climax ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "climax", event.target.value)} /></label><label className="space-y-2 text-sm"><span className="text-xs text-muted-foreground">下卷钩子</span><textarea className={cn(textareaClassName, "min-h-[112px]")} value={selectedVolume.nextVolumeHook ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "nextVolumeHook", event.target.value)} /></label><label className="space-y-2 text-sm xl:col-span-2"><span className="text-xs text-muted-foreground">未兑现事项</span><textarea className={cn(textareaClassName, "min-h-[96px]")} placeholder="每行一个，或用中文逗号分隔。" value={selectedVolume.openPayoffs.join("\n")} onChange={(event) => onOpenPayoffsChange(selectedVolume.id, event.target.value)} /></label></div> : null}
                </CardContent>
              </Card>
            ) : null}

            {selectedVolume && selectedChapter ? (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">第{selectedChapter.chapterOrder}章</Badge><Badge variant="outline">卷内序号 {selectedChapterIndex + 1}</Badge></div>
                      <CardTitle className="text-xl">{selectedChapter.title || `第${selectedChapter.chapterOrder}章`}</CardTitle>
                      <div className="text-sm text-muted-foreground">这一步先稳住标题和摘要，再按需点按钮生成章节目标、执行边界和任务单。</div>
                    </div>
                    <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => selectedChapterIndex > 0 && setSelectedChapterId(selectedVolume.chapters[selectedChapterIndex - 1]?.id ?? "")} disabled={selectedChapterIndex <= 0}>上一章</Button><Button size="sm" variant="outline" onClick={() => selectedChapterIndex >= 0 && selectedChapterIndex < selectedVolume.chapters.length - 1 && setSelectedChapterId(selectedVolume.chapters[selectedChapterIndex + 1]?.id ?? "")} disabled={selectedChapterIndex < 0 || selectedChapterIndex >= selectedVolume.chapters.length - 1}>下一章</Button><Button size="sm" variant="outline" onClick={() => onMoveChapter(selectedVolume.id, selectedChapter.id, -1)} disabled={selectedChapterIndex <= 0}>上移</Button><Button size="sm" variant="outline" onClick={() => onMoveChapter(selectedVolume.id, selectedChapter.id, 1)} disabled={selectedChapterIndex < 0 || selectedChapterIndex >= selectedVolume.chapters.length - 1}>下移</Button><Button size="sm" variant="outline" onClick={() => onRemoveChapter(selectedVolume.id, selectedChapter.id)} disabled={selectedVolume.chapters.length <= 1}>删除</Button></div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_360px]">
                    <div className="space-y-4">
                      <label className="space-y-2 text-sm"><span className="text-xs text-muted-foreground">章节标题</span><Input value={selectedChapter.title} onChange={(event) => onChapterFieldChange(selectedVolume.id, selectedChapter.id, "title", event.target.value)} /></label>
                      <label className="space-y-2 text-sm"><span className="text-xs text-muted-foreground">章节摘要</span><textarea className={cn(textareaClassName, "min-h-[160px]")} placeholder="用 2-4 句交代这章最关键的事件推进。" value={selectedChapter.summary} onChange={(event) => onChapterFieldChange(selectedVolume.id, selectedChapter.id, "summary", event.target.value)} /></label>
                      <label className="space-y-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">章节目标</span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onGenerateChapterDetail(selectedVolume.id, selectedChapter.id, "purpose")}
                            disabled={isGeneratingChapterDetail}
                          >
                            {isGeneratingChapterDetail && generatingChapterDetailMode === "purpose" && generatingChapterDetailChapterId === selectedChapter.id ? "生成中..." : "AI生成"}
                          </Button>
                        </div>
                        <textarea className={cn(textareaClassName, "min-h-[132px]")} placeholder="这章必须推进什么关系、冲突或信息兑现。" value={selectedChapter.purpose ?? ""} onChange={(event) => onChapterFieldChange(selectedVolume.id, selectedChapter.id, "purpose", event.target.value)} />
                      </label>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                      <div className="mb-4 flex items-center justify-between gap-2">
                        <div className="text-sm font-medium text-foreground">执行边界</div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onGenerateChapterDetail(selectedVolume.id, selectedChapter.id, "boundary")}
                          disabled={isGeneratingChapterDetail}
                        >
                          {isGeneratingChapterDetail && generatingChapterDetailMode === "boundary" && generatingChapterDetailChapterId === selectedChapter.id ? "生成中..." : "AI生成"}
                        </Button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-3">
                        <label className="space-y-2 text-sm"><span className="text-xs text-muted-foreground">冲突等级</span><Input type="number" min={0} max={100} value={selectedChapter.conflictLevel ?? ""} onChange={(event) => onChapterNumberChange(selectedVolume.id, selectedChapter.id, "conflictLevel", event.target.value ? Number(event.target.value) : null)} /></label>
                        <label className="space-y-2 text-sm"><span className="text-xs text-muted-foreground">揭露等级</span><Input type="number" min={0} max={100} value={selectedChapter.revealLevel ?? ""} onChange={(event) => onChapterNumberChange(selectedVolume.id, selectedChapter.id, "revealLevel", event.target.value ? Number(event.target.value) : null)} /></label>
                        <label className="space-y-2 text-sm"><span className="text-xs text-muted-foreground">目标字数</span><Input type="number" min={200} step={100} value={selectedChapter.targetWordCount ?? ""} onChange={(event) => onChapterNumberChange(selectedVolume.id, selectedChapter.id, "targetWordCount", event.target.value ? Number(event.target.value) : null)} /></label>
                      </div>
                      <div className="mt-4 space-y-4">
                        <label className="space-y-2 text-sm"><span className="text-xs text-muted-foreground">禁止事项</span><textarea className={cn(textareaClassName, "min-h-[120px]")} placeholder="列出这章不能触碰的剧情走向、角色行为或语气错误。" value={selectedChapter.mustAvoid ?? ""} onChange={(event) => onChapterFieldChange(selectedVolume.id, selectedChapter.id, "mustAvoid", event.target.value)} /></label>
                        <label className="space-y-2 text-sm"><span className="text-xs text-muted-foreground">兑现关联</span><textarea className={cn(textareaClassName, "min-h-[120px]")} placeholder="每行一个，或用中文逗号分隔。" value={selectedChapter.payoffRefs.join("\n")} onChange={(event) => onChapterPayoffRefsChange(selectedVolume.id, selectedChapter.id, event.target.value)} /></label>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div><div className="text-sm font-medium text-foreground">任务单</div><div className="mt-1 text-xs text-muted-foreground">这是给章节执行阶段的明确指令，建议在摘要和目标稳定后再补充。</div></div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onGenerateChapterDetail(selectedVolume.id, selectedChapter.id, "task_sheet")}
                        disabled={isGeneratingChapterDetail}
                      >
                        {isGeneratingChapterDetail && generatingChapterDetailMode === "task_sheet" && generatingChapterDetailChapterId === selectedChapter.id ? "生成中..." : "AI生成"}
                      </Button>
                    </div>
                    <textarea className={cn(textareaClassName, "min-h-[180px]")} value={selectedChapter.taskSheet ?? ""} onChange={(event) => onChapterFieldChange(selectedVolume.id, selectedChapter.id, "taskSheet", event.target.value)} />
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">派生 JSON 预览</CardTitle>
                <Button variant="outline" onClick={() => setShowJsonPreview((value) => !value)}>{showJsonPreview ? "隐藏" : "展开"}</Button>
              </CardHeader>
              {showJsonPreview ? <CardContent><textarea className="min-h-[320px] w-full rounded-md border bg-muted/20 p-3 text-sm" readOnly value={draftText} /></CardContent> : null}
            </Card>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
