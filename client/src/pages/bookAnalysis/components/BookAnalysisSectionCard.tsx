import type { BookAnalysisSection } from "@ai-novel/shared/types/bookAnalysis";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SectionDraft } from "../bookAnalysis.types";
import { formatStatus } from "../bookAnalysis.utils";

interface BookAnalysisSectionCardProps {
  section: BookAnalysisSection;
  draft: SectionDraft;
  canOperate: boolean;
  isRegenerating: boolean;
  isSaving: boolean;
  onDraftChange: (section: BookAnalysisSection, patch: Partial<SectionDraft>) => void;
  onRegenerate: (section: BookAnalysisSection) => void;
  onSave: (section: BookAnalysisSection) => void;
}

export default function BookAnalysisSectionCard(props: BookAnalysisSectionCardProps) {
  const {
    section,
    draft,
    canOperate,
    isRegenerating,
    isSaving,
    onDraftChange,
    onRegenerate,
    onSave,
  } = props;

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
              disabled={!canOperate || draft.frozen || isRegenerating}
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

        <div className="space-y-2">
          <div className="text-sm font-medium">编辑内容</div>
          <textarea
            className="min-h-[220px] w-full rounded-md border bg-background p-3 text-sm"
            value={draft.editedContent}
            onChange={(event) => onDraftChange(section, { editedContent: event.target.value })}
            placeholder="编辑或润色本小节；留空则使用 AI 草稿内容。"
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">备注</div>
          <textarea
            className="min-h-[120px] w-full rounded-md border bg-background p-3 text-sm"
            value={draft.notes}
            onChange={(event) => onDraftChange(section, { notes: event.target.value })}
            placeholder="添加备注、假设或后续行动。"
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">AI 草稿</div>
          <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
            {section.aiContent?.trim() || "暂无 AI 草稿。"}
          </pre>
        </div>

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
