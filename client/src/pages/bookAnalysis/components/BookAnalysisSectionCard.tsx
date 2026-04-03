import { useState } from "react";
import type { BookAnalysisSection } from "@ai-novel/shared/types/bookAnalysis";
import MarkdownViewer from "@/components/common/MarkdownViewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SectionDraft } from "../bookAnalysis.types";
import { formatStatus } from "../bookAnalysis.utils";

interface BookAnalysisSectionCardProps {
  section: BookAnalysisSection;
  draft: SectionDraft;
  canOperate: boolean;
  isRegenerating: boolean;
  isOptimizing: boolean;
  isSaving: boolean;
  onDraftChange: (section: BookAnalysisSection, patch: Partial<SectionDraft>) => void;
  onRegenerate: (section: BookAnalysisSection) => void;
  onOptimize: (section: BookAnalysisSection) => void;
  onApplyOptimizePreview: (section: BookAnalysisSection) => void;
  onCancelOptimizePreview: (section: BookAnalysisSection) => void;
  onSave: (section: BookAnalysisSection) => void;
}

export default function BookAnalysisSectionCard(props: BookAnalysisSectionCardProps) {
  const {
    section,
    draft,
    canOperate,
    isRegenerating,
    isOptimizing,
    isSaving,
    onDraftChange,
    onRegenerate,
    onOptimize,
    onApplyOptimizePreview,
    onCancelOptimizePreview,
    onSave,
  } = props;
  const [draftMode, setDraftMode] = useState<"view" | "edit">("view");

  const canRegenerate = canOperate && !draft.frozen && !isRegenerating;
  const canOptimize = canOperate && !draft.frozen && !isOptimizing && draft.optimizeInstruction.trim().length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CardTitle>{section.title}</CardTitle>
            <Badge variant="outline">{formatStatus(section.status)}</Badge>
            {draft.frozen ? <Badge variant="secondary">已冻结</Badge> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!canRegenerate}
              onClick={() => onRegenerate(section)}
            >
              重新生成
            </Button>
            <Button size="sm" disabled={!canOperate || isSaving} onClick={() => onSave(section)}>
              保存
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.frozen}
            onChange={(event) => onDraftChange(section, { frozen: event.target.checked })}
          />
          冻结此小节，自动重跑时不覆盖其内容。
        </label>

        {draft.frozen ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            当前已冻结：请先取消冻结，才能使用“重新生成”或“AI 优化”。
          </div>
        ) : null}

        <div className="space-y-2">
          <Tabs value={draftMode} onValueChange={(value) => setDraftMode(value as "view" | "edit")} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">当前草稿</div>
              <TabsList className="h-9">
                <TabsTrigger value="view">查看模式</TabsTrigger>
                <TabsTrigger value="edit">编辑模式</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="view" className="mt-0">
              <div className="min-h-[220px] rounded-md border bg-muted/20 p-4">
                {draft.editedContent.trim() ? (
                  <MarkdownViewer content={draft.editedContent} />
                ) : (
                  <div className="text-sm text-muted-foreground">当前小节还没有可展示的内容。</div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="edit" className="mt-0">
              <textarea
                className="min-h-[220px] w-full rounded-md border bg-background p-3 text-sm"
                value={draft.editedContent}
                onChange={(event) => onDraftChange(section, { editedContent: event.target.value })}
                placeholder="在此直接编辑当前小节草稿。"
              />
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <div className="text-sm font-medium">AI 优化 / 修正</div>
          <textarea
            className="min-h-[90px] w-full rounded-md border bg-background p-2 text-sm"
            value={draft.optimizeInstruction}
            onChange={(event) => onDraftChange(section, { optimizeInstruction: event.target.value })}
            placeholder="输入优化或修正提示词，例如：压缩冗余、突出冲突、保持同样事实。"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!canOptimize}
              onClick={() => onOptimize(section)}
            >
              {isOptimizing ? "生成预览中..." : "生成优化预览"}
            </Button>
          </div>

          {draft.optimizePreview.trim() ? (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">优化预览</div>
              <div className="max-h-[320px] overflow-auto rounded-md border bg-muted/20 p-4">
                <MarkdownViewer content={draft.optimizePreview} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => onApplyOptimizePreview(section)}>
                  应用到当前草稿
                </Button>
                <Button size="sm" variant="outline" onClick={() => onCancelOptimizePreview(section)}>
                  取消预览
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">高级选项：备注</summary>
          <div className="mt-3 space-y-2">
            <div className="text-sm font-medium">备注</div>
            <textarea
              className="min-h-[120px] w-full rounded-md border bg-background p-3 text-sm"
              value={draft.notes}
              onChange={(event) => onDraftChange(section, { notes: event.target.value })}
              placeholder="添加备注、假设或后续行动。"
            />
          </div>
        </details>

        {section.evidence.length > 0 ? (
          <div className="space-y-2">
            <div className="text-sm font-medium">证据</div>
            <div className="space-y-2">
              {section.evidence.map((item, index) => (
                <div key={`${section.id}-${index}`} className="rounded-md border p-3 text-sm">
                  <div className="font-medium">
                    [{item.sourceLabel}] {item.label}
                  </div>
                  <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.excerpt}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
