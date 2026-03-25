import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import WorldInjectionHint from "./WorldInjectionHint";
import type { StructuredTabViewProps } from "./NovelEditView.types";

export default function StructuredOutlineTab(props: StructuredTabViewProps) {
  const {
    worldInjectionSummary,
    hasCharacters,
    isGenerating,
    onGenerate,
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

  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [showSyncPreview, setShowSyncPreview] = useState(true);
  const [batchConflictLevel, setBatchConflictLevel] = useState(60);
  const [batchWordCount, setBatchWordCount] = useState(2500);

  const handleApplySync = () => {
    if (syncOptions.applyDeletes && syncPreview.deleteCount > 0) {
      const confirmed = window.confirm(`将删除 ${syncPreview.deleteCount} 个章节，是否继续？`);
      if (!confirmed) {
        return;
      }
    }
    if (!syncOptions.preserveContent && syncPreview.clearContentCount > 0) {
      const confirmed = window.confirm(`将清空 ${syncPreview.clearContentCount} 个已有正文章节内容，是否继续？`);
      if (!confirmed) {
        return;
      }
    }
    onApplySync(syncOptions);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>卷纲 / 章纲联动工作台</CardTitle>
        <div className="flex gap-2">
          <Button onClick={onGenerate} disabled={isGenerating || !hasCharacters}>
            {isGenerating ? "生成中..." : "重生成卷纲"}
          </Button>
          <Button variant="secondary" onClick={onSave} disabled={isSaving}>
            {isSaving ? "保存中..." : "保存卷纲/章纲"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />
        {!hasCharacters ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            <span>请先补角色，再拆卷纲和章纲。</span>
            <Button size="sm" variant="outline" onClick={onGoToCharacterTab}>去角色管理</Button>
          </div>
        ) : null}
        {syncMessage ? <div className="text-xs text-muted-foreground">{syncMessage}</div> : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">同步与批量工具</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
                <span>冲突等级</span>
                <input
                  className="w-16 rounded border px-1 py-0.5 text-xs"
                  type="number"
                  min={0}
                  max={100}
                  value={batchConflictLevel}
                  onChange={(event) => setBatchConflictLevel(Number(event.target.value || 0))}
                />
                <Button size="sm" variant="outline" onClick={() => onApplyBatch({ conflictLevel: batchConflictLevel })}>
                  批量设置
                </Button>
              </div>
              <div className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
                <span>目标字数</span>
                <input
                  className="w-20 rounded border px-1 py-0.5 text-xs"
                  type="number"
                  min={200}
                  step={100}
                  value={batchWordCount}
                  onChange={(event) => setBatchWordCount(Number(event.target.value || 200))}
                />
                <Button size="sm" variant="outline" onClick={() => onApplyBatch({ targetWordCount: batchWordCount })}>
                  批量设置
                </Button>
              </div>
              <Button variant="outline" onClick={() => onApplyBatch({ generateTaskSheet: true })}>
                生成任务单
              </Button>
              <Button variant="outline" onClick={() => setShowSyncPreview((value) => !value)}>
                {showSyncPreview ? "隐藏同步差异" : "查看同步差异"}
              </Button>
              <Button onClick={handleApplySync} disabled={isApplyingSync || volumes.length === 0}>
                {isApplyingSync ? "同步中..." : "同步到章节执行"}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={syncOptions.preserveContent}
                  onChange={(event) => onSyncOptionsChange({ preserveContent: event.target.checked })}
                />
                保留已有正文
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={syncOptions.applyDeletes}
                  onChange={(event) => onSyncOptionsChange({ applyDeletes: event.target.checked })}
                />
                同步时删除卷纲外章节
              </label>
            </div>
            {showSyncPreview ? (
              <div className="space-y-2 rounded-md border p-2 text-xs">
                <div className="font-medium">
                  新增 {syncPreview.createCount} | 变更 {syncPreview.updateCount} | 移动 {syncPreview.moveCount} | 保留 {syncPreview.keepCount} | 删除 {syncPreview.deleteCount}
                </div>
                <div className="text-muted-foreground">
                  待删除候选 {syncPreview.deleteCandidateCount} | 受影响正文章节 {syncPreview.affectedGeneratedCount} | 将清空正文 {syncPreview.clearContentCount}
                </div>
                <div className="max-h-56 space-y-1 overflow-auto">
                  {syncPreview.items.map((item) => (
                    <div key={`${item.action}-${item.chapterOrder}-${item.nextTitle}`} className="flex items-start justify-between gap-2 rounded border p-1.5">
                      <div>
                        <div>第{item.chapterOrder}章：{item.previousTitle && item.previousTitle !== item.nextTitle ? `${item.previousTitle} -> ${item.nextTitle}` : item.nextTitle}</div>
                        <div className="text-muted-foreground">所属卷：{item.volumeTitle}</div>
                        {item.changedFields.length > 0 ? (
                          <div className="text-muted-foreground">字段：{item.changedFields.join("、")}</div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1">
                        {item.hasContent ? <Badge variant="outline">有正文</Badge> : null}
                        <Badge variant={item.action === "create" ? "default" : item.action === "keep" ? "outline" : "secondary"}>
                          {item.action}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-3">
          {volumes.map((volume) => (
            <Card key={volume.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Badge variant="outline">第{volume.sortOrder}卷</Badge>
                  <span>{volume.title}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3 text-xs text-muted-foreground">
                  <div className="rounded-md border p-2">
                    <div className="font-medium text-foreground">卷摘要</div>
                    <div>{volume.summary || "未填写"}</div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="font-medium text-foreground">卷末高潮</div>
                    <div>{volume.climax || "未填写"}</div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="font-medium text-foreground">下卷钩子</div>
                    <div>{volume.nextVolumeHook || "未填写"}</div>
                  </div>
                </div>
                <div className="space-y-3">
                  {volume.chapters.map((chapter, chapterIndex) => (
                    <div key={chapter.id} className="rounded-md border p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">第{chapter.chapterOrder}章</Badge>
                          <span className="text-sm text-muted-foreground">卷内序号 {chapterIndex + 1}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => onMoveChapter(volume.id, chapter.id, -1)} disabled={chapterIndex === 0}>上移</Button>
                          <Button size="sm" variant="outline" onClick={() => onMoveChapter(volume.id, chapter.id, 1)} disabled={chapterIndex === volume.chapters.length - 1}>下移</Button>
                          <Button size="sm" variant="outline" onClick={() => onRemoveChapter(volume.id, chapter.id)} disabled={volume.chapters.length <= 1}>删除</Button>
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="space-y-1 text-sm">
                          <span className="text-xs text-muted-foreground">章节标题</span>
                          <input
                            className="w-full rounded-md border bg-background p-2"
                            value={chapter.title}
                            onChange={(event) => onChapterFieldChange(volume.id, chapter.id, "title", event.target.value)}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="text-xs text-muted-foreground">章节摘要</span>
                          <textarea
                            className="min-h-[84px] w-full rounded-md border bg-background p-2"
                            value={chapter.summary}
                            onChange={(event) => onChapterFieldChange(volume.id, chapter.id, "summary", event.target.value)}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="text-xs text-muted-foreground">章节目标</span>
                          <textarea
                            className="min-h-[84px] w-full rounded-md border bg-background p-2"
                            value={chapter.purpose ?? ""}
                            onChange={(event) => onChapterFieldChange(volume.id, chapter.id, "purpose", event.target.value)}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="text-xs text-muted-foreground">禁止事项</span>
                          <textarea
                            className="min-h-[84px] w-full rounded-md border bg-background p-2"
                            value={chapter.mustAvoid ?? ""}
                            onChange={(event) => onChapterFieldChange(volume.id, chapter.id, "mustAvoid", event.target.value)}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="text-xs text-muted-foreground">冲突等级</span>
                          <input
                            className="w-full rounded-md border bg-background p-2"
                            type="number"
                            min={0}
                            max={100}
                            value={chapter.conflictLevel ?? ""}
                            onChange={(event) => onChapterNumberChange(volume.id, chapter.id, "conflictLevel", event.target.value ? Number(event.target.value) : null)}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="text-xs text-muted-foreground">揭露等级</span>
                          <input
                            className="w-full rounded-md border bg-background p-2"
                            type="number"
                            min={0}
                            max={100}
                            value={chapter.revealLevel ?? ""}
                            onChange={(event) => onChapterNumberChange(volume.id, chapter.id, "revealLevel", event.target.value ? Number(event.target.value) : null)}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="text-xs text-muted-foreground">目标字数</span>
                          <input
                            className="w-full rounded-md border bg-background p-2"
                            type="number"
                            min={200}
                            step={100}
                            value={chapter.targetWordCount ?? ""}
                            onChange={(event) => onChapterNumberChange(volume.id, chapter.id, "targetWordCount", event.target.value ? Number(event.target.value) : null)}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="text-xs text-muted-foreground">兑现关联</span>
                          <textarea
                            className="min-h-[84px] w-full rounded-md border bg-background p-2"
                            placeholder="每行一个，或用中文逗号分隔。"
                            value={chapter.payoffRefs.join("\n")}
                            onChange={(event) => onChapterPayoffRefsChange(volume.id, chapter.id, event.target.value)}
                          />
                        </label>
                        <label className="space-y-1 text-sm md:col-span-2">
                          <span className="text-xs text-muted-foreground">任务单</span>
                          <textarea
                            className="min-h-[96px] w-full rounded-md border bg-background p-2"
                            value={chapter.taskSheet ?? ""}
                            onChange={(event) => onChapterFieldChange(volume.id, chapter.id, "taskSheet", event.target.value)}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" onClick={() => onAddChapter(volume.id)}>新增本卷章节</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">派生 JSON 预览</CardTitle>
            <Button variant="outline" onClick={() => setShowJsonPreview((value) => !value)}>
              {showJsonPreview ? "隐藏" : "展开"}
            </Button>
          </CardHeader>
          {showJsonPreview ? (
            <CardContent>
              <textarea
                className="min-h-[320px] w-full rounded-md border bg-muted/20 p-3 text-sm"
                readOnly
                value={draftText}
              />
            </CardContent>
          ) : null}
        </Card>
      </CardContent>
    </Card>
  );
}
