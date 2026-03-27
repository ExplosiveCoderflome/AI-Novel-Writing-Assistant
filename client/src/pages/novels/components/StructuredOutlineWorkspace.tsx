import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { findBeatSheet } from "../volumePlan.utils";
import WorldInjectionHint from "./WorldInjectionHint";
import type { StructuredTabViewProps } from "./NovelEditView.types";

const textareaClassName =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function actionLabel(action: StructuredTabViewProps["syncPreview"]["items"][number]["action"]) {
  if (action === "create") return "新增";
  if (action === "update") return "更新";
  if (action === "move") return "移动";
  if (action === "keep") return "保留";
  if (action === "delete") return "删除";
  return "待删候选";
}

export default function StructuredOutlineWorkspace(props: StructuredTabViewProps) {
  const {
    worldInjectionSummary,
    hasCharacters,
    hasUnsavedVolumeDraft,
    generationNotice,
    beatSheets,
    rebalanceDecisions,
    isGeneratingBeatSheet,
    onGenerateBeatSheet,
    isGeneratingChapterList,
    onGenerateChapterList,
    isGeneratingChapterDetail,
    isGeneratingChapterDetailBundle,
    generatingChapterDetailMode,
    generatingChapterDetailChapterId,
    onGenerateChapterDetail,
    onGenerateChapterDetailBundle,
    onGoToCharacterTab,
    volumes,
    draftText,
    syncPreview,
    syncOptions,
    onSyncOptionsChange,
    onApplySync,
    isApplyingSync,
    syncMessage,
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

  const [selectedVolumeId, setSelectedVolumeId] = useState(volumes[0]?.id ?? "");
  const [selectedChapterId, setSelectedChapterId] = useState(volumes[0]?.chapters[0]?.id ?? "");
  const [showSyncPreview, setShowSyncPreview] = useState(false);
  const [showJsonPreview, setShowJsonPreview] = useState(false);

  useEffect(() => {
    if (!volumes.some((volume) => volume.id === selectedVolumeId)) {
      setSelectedVolumeId(volumes[0]?.id ?? "");
    }
  }, [selectedVolumeId, volumes]);

  const selectedVolume = volumes.find((volume) => volume.id === selectedVolumeId) ?? volumes[0];
  const selectedBeatSheet = selectedVolume ? findBeatSheet(beatSheets, selectedVolume.id) : null;
  const selectedChapter = selectedVolume?.chapters.find((chapter) => chapter.id === selectedChapterId) ?? selectedVolume?.chapters[0];
  const selectedChapterIndex = selectedVolume && selectedChapter
    ? selectedVolume.chapters.findIndex((chapter) => chapter.id === selectedChapter.id)
    : -1;
  const locked = !selectedBeatSheet;
  const selectedRebalance = selectedVolume
    ? rebalanceDecisions.filter((decision) => decision.anchorVolumeId === selectedVolume.id)
    : [];

  useEffect(() => {
    const chapters = selectedVolume?.chapters ?? [];
    if (!chapters.some((chapter) => chapter.id === selectedChapterId)) {
      setSelectedChapterId(chapters[0]?.id ?? "");
    }
  }, [selectedChapterId, selectedVolume]);

  if (volumes.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>节奏 / 拆章</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />
          {!hasCharacters ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <span>请先补角色，再拆节奏和章节。</span>
              <Button size="sm" variant="outline" onClick={onGoToCharacterTab}>去角色管理</Button>
            </div>
          ) : null}
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">先在上一页生成卷战略和卷骨架。</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <CardTitle>节奏 / 拆章</CardTitle>
          <div className="text-sm text-muted-foreground">先做当前卷节奏板，再拆当前卷章节列表，最后补齐单章细化。</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedVolume ? (
            <>
              <Button variant="outline" onClick={() => onGenerateBeatSheet(selectedVolume.id)} disabled={isGeneratingBeatSheet}>
                {isGeneratingBeatSheet ? "生成中..." : "生成当前卷节奏板"}
              </Button>
              <Button onClick={() => onGenerateChapterList(selectedVolume.id)} disabled={isGeneratingChapterList || locked}>
                {isGeneratingChapterList ? "生成中..." : "生成当前卷章节列表"}
              </Button>
            </>
          ) : null}
          <Button variant="secondary" onClick={onSave} disabled={isSaving}>{isSaving ? "保存中..." : "保存卷工作区"}</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
          <span>{generationNotice}</span>
          {hasUnsavedVolumeDraft ? <Badge variant="secondary">含未保存草稿</Badge> : null}
        </div>
        {syncMessage ? <div className="text-xs text-muted-foreground">{syncMessage}</div> : null}
        {locked ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">当前卷还没有节奏板，章节列表生成已锁定。</div> : null}

        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <Card>
            <CardHeader><CardTitle className="text-base">卷导航</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {volumes.map((volume) => (
                <button key={volume.id} type="button" onClick={() => { setSelectedVolumeId(volume.id); setSelectedChapterId(volume.chapters[0]?.id ?? ""); }} className={cn("w-full rounded-xl border p-3 text-left", selectedVolume?.id === volume.id ? "border-primary/50 bg-primary/5" : "border-border/70")}>
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={selectedVolume?.id === volume.id ? "default" : "outline"}>第{volume.sortOrder}卷</Badge>
                    {findBeatSheet(beatSheets, volume.id) ? <Badge variant="secondary">有节奏板</Badge> : <Badge variant="outline">未做节奏板</Badge>}
                  </div>
                  <div className="mt-2 text-sm font-medium">{volume.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{volume.mainPromise || volume.summary || "先补这卷的核心承诺。"}</div>
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {selectedVolume ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">当前卷节奏板</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {selectedBeatSheet ? selectedBeatSheet.beats.map((beat) => (
                    <div key={beat.key} className="rounded-md border p-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{beat.label}</Badge>
                        <Badge variant="secondary">{beat.chapterSpanHint}</Badge>
                      </div>
                      <div className="mt-2">{beat.summary}</div>
                      <div className="mt-1 text-xs text-muted-foreground">必须交付：{beat.mustDeliver.join("、")}</div>
                    </div>
                  )) : <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">先为当前卷生成节奏板。</div>}
                </CardContent>
              </Card>
            ) : null}

            {selectedRebalance.length > 0 ? (
              <Card>
                <CardHeader><CardTitle className="text-base">相邻卷再平衡建议</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {selectedRebalance.map((decision) => (
                    <div key={`${decision.anchorVolumeId}-${decision.affectedVolumeId}-${decision.summary}`} className="rounded-md border p-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{decision.direction}</Badge>
                        <Badge variant={decision.severity === "high" ? "secondary" : decision.severity === "medium" ? "outline" : "default"}>{decision.severity}</Badge>
                      </div>
                      <div className="mt-2">{decision.summary}</div>
                      <div className="mt-1 text-xs text-muted-foreground">动作：{decision.actions.join("；")}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {selectedVolume && selectedChapter ? (
              <Card>
                <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <CardTitle className="text-base">当前章节细化</CardTitle>
                    <div className="text-sm text-muted-foreground">标题和摘要稳定后，再补目标、边界和任务单。</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => onGenerateChapterDetailBundle(selectedVolume.id, selectedChapter.id)} disabled={isGeneratingChapterDetail || locked}>
                      {isGeneratingChapterDetailBundle && generatingChapterDetailChapterId === selectedChapter.id ? "整套生成中..." : "一键 AI生成"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onAddChapter(selectedVolume.id)}>新增章节</Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <label className="space-y-2 text-sm"><span className="text-xs text-muted-foreground">章节标题</span><Input value={selectedChapter.title} onChange={(event) => onChapterFieldChange(selectedVolume.id, selectedChapter.id, "title", event.target.value)} /></label>
                  <label className="space-y-2 text-sm"><span className="text-xs text-muted-foreground">章节摘要</span><textarea className={cn(textareaClassName, "min-h-[140px]")} value={selectedChapter.summary} onChange={(event) => onChapterFieldChange(selectedVolume.id, selectedChapter.id, "summary", event.target.value)} /></label>
                  <label className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">章节目标</span><Button size="sm" variant="outline" onClick={() => onGenerateChapterDetail(selectedVolume.id, selectedChapter.id, "purpose")} disabled={isGeneratingChapterDetail || locked}>{isGeneratingChapterDetail && generatingChapterDetailMode === "purpose" && generatingChapterDetailChapterId === selectedChapter.id ? "修正中..." : "AI修正"}</Button></div>
                    <textarea className={cn(textareaClassName, "min-h-[110px]")} value={selectedChapter.purpose ?? ""} onChange={(event) => onChapterFieldChange(selectedVolume.id, selectedChapter.id, "purpose", event.target.value)} />
                  </label>
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="space-y-2 text-sm"><span className="text-xs text-muted-foreground">冲突等级</span><Input type="number" min={0} max={100} value={selectedChapter.conflictLevel ?? ""} onChange={(event) => onChapterNumberChange(selectedVolume.id, selectedChapter.id, "conflictLevel", event.target.value ? Number(event.target.value) : null)} /></label>
                    <label className="space-y-2 text-sm"><span className="text-xs text-muted-foreground">揭露等级</span><Input type="number" min={0} max={100} value={selectedChapter.revealLevel ?? ""} onChange={(event) => onChapterNumberChange(selectedVolume.id, selectedChapter.id, "revealLevel", event.target.value ? Number(event.target.value) : null)} /></label>
                    <label className="space-y-2 text-sm"><span className="text-xs text-muted-foreground">目标字数</span><Input type="number" min={200} step={100} value={selectedChapter.targetWordCount ?? ""} onChange={(event) => onChapterNumberChange(selectedVolume.id, selectedChapter.id, "targetWordCount", event.target.value ? Number(event.target.value) : null)} /></label>
                  </div>
                  <label className="space-y-2 text-sm"><span className="text-xs text-muted-foreground">禁止事项</span><textarea className={cn(textareaClassName, "min-h-[110px]")} value={selectedChapter.mustAvoid ?? ""} onChange={(event) => onChapterFieldChange(selectedVolume.id, selectedChapter.id, "mustAvoid", event.target.value)} /></label>
                  <label className="space-y-2 text-sm"><span className="text-xs text-muted-foreground">兑现关联</span><textarea className={cn(textareaClassName, "min-h-[110px]")} value={selectedChapter.payoffRefs.join("\n")} onChange={(event) => onChapterPayoffRefsChange(selectedVolume.id, selectedChapter.id, event.target.value)} /></label>
                  <label className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">任务单</span><Button size="sm" variant="outline" onClick={() => onGenerateChapterDetail(selectedVolume.id, selectedChapter.id, "task_sheet")} disabled={isGeneratingChapterDetail || locked}>{isGeneratingChapterDetail && generatingChapterDetailMode === "task_sheet" && generatingChapterDetailChapterId === selectedChapter.id ? "修正中..." : "AI修正"}</Button></div>
                    <textarea className={cn(textareaClassName, "min-h-[140px]")} value={selectedChapter.taskSheet ?? ""} onChange={(event) => onChapterFieldChange(selectedVolume.id, selectedChapter.id, "taskSheet", event.target.value)} />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => onMoveChapter(selectedVolume.id, selectedChapter.id, -1)} disabled={selectedChapterIndex <= 0}>上移</Button>
                    <Button size="sm" variant="outline" onClick={() => onMoveChapter(selectedVolume.id, selectedChapter.id, 1)} disabled={selectedChapterIndex < 0 || selectedChapterIndex >= selectedVolume.chapters.length - 1}>下移</Button>
                    <Button size="sm" variant="outline" onClick={() => onRemoveChapter(selectedVolume.id, selectedChapter.id)} disabled={selectedVolume.chapters.length <= 1}>删除</Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">同步与预览</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowSyncPreview((value) => !value)}>{showSyncPreview ? "隐藏同步差异" : "查看同步差异"}</Button>
                  <Button variant="outline" onClick={() => setShowJsonPreview((value) => !value)}>{showJsonPreview ? "隐藏 JSON" : "查看 JSON"}</Button>
                  <Button onClick={() => onApplyBatch({ generateTaskSheet: true })}>批量补任务单</Button>
                  <Button onClick={() => onApplySync(syncOptions)} disabled={isApplyingSync}>{isApplyingSync ? "同步中..." : "同步到章节执行"}</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <label className="flex items-center gap-2 rounded-full border border-border/70 px-3 py-1.5"><input type="checkbox" checked={syncOptions.preserveContent} onChange={(event) => onSyncOptionsChange({ preserveContent: event.target.checked })} />保留已有正文</label>
                  <label className="flex items-center gap-2 rounded-full border border-border/70 px-3 py-1.5"><input type="checkbox" checked={syncOptions.applyDeletes} onChange={(event) => onSyncOptionsChange({ applyDeletes: event.target.checked })} />同步时删除卷纲外章节</label>
                  <Button size="sm" variant="outline" onClick={() => onApplyBatch({ conflictLevel: 60 })}>统一冲突等级 60</Button>
                  <Button size="sm" variant="outline" onClick={() => onApplyBatch({ targetWordCount: 2500 })}>统一字数 2500</Button>
                </div>
                {showSyncPreview ? <div className="max-h-64 space-y-2 overflow-auto rounded-xl border border-border/70 bg-muted/20 p-3 text-xs">{syncPreview.items.map((item) => <div key={`${item.action}-${item.chapterOrder}-${item.nextTitle}`} className="rounded-lg border border-border/70 bg-background/80 p-2.5"><div className="font-medium">第{item.chapterOrder}章：{item.nextTitle}</div><div className="text-muted-foreground">字段：{item.changedFields.join("、") || "无"}</div><Badge className="mt-2" variant={item.action === "delete" || item.action === "delete_candidate" ? "secondary" : item.action === "create" ? "default" : "outline"}>{actionLabel(item.action)}</Badge></div>)}</div> : null}
                {showJsonPreview ? <textarea className="min-h-[320px] w-full rounded-md border bg-muted/20 p-3 text-sm" readOnly value={draftText} /> : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
