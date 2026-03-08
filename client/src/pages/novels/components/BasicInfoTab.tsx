import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface WorldOption {
  id: string;
  name: string;
}

interface BasicInfoTabProps {
  basicForm: {
    title: string;
    description: string;
    worldId: string;
    status: "draft" | "published";
    writingMode: "original" | "continuation";
    continuationSourceType: "novel" | "knowledge_document";
    sourceNovelId: string;
    sourceKnowledgeDocumentId: string;
    continuationBookAnalysisId: string;
    continuationBookAnalysisSections: BookAnalysisSectionKey[];
  };
  worldOptions: WorldOption[];
  sourceNovelOptions: Array<{ id: string; title: string }>;
  sourceKnowledgeOptions: Array<{ id: string; title: string }>;
  sourceNovelBookAnalysisOptions: Array<{
    id: string;
    title: string;
    documentTitle: string;
    documentVersionNumber: number;
  }>;
  isLoadingSourceNovelBookAnalyses: boolean;
  availableBookAnalysisSections: Array<{ key: BookAnalysisSectionKey; title: string }>;
  onFormChange: (patch: Partial<BasicInfoTabProps["basicForm"]>) => void;
  onSave: () => void;
  isSaving: boolean;
}

export default function BasicInfoTab(props: BasicInfoTabProps) {
  const {
    basicForm,
    worldOptions,
    sourceNovelOptions,
    sourceKnowledgeOptions,
    sourceNovelBookAnalysisOptions,
    isLoadingSourceNovelBookAnalyses,
    availableBookAnalysisSections,
    onFormChange,
    onSave,
    isSaving,
  } = props;

  const continuationSourceMissing = basicForm.writingMode === "continuation"
    && (
      (basicForm.continuationSourceType === "novel" && !basicForm.sourceNovelId)
      || (basicForm.continuationSourceType === "knowledge_document" && !basicForm.sourceKnowledgeDocumentId)
    );

  const continuationAnalysisSectionMissing = basicForm.writingMode === "continuation"
    && Boolean(basicForm.continuationBookAnalysisId)
    && basicForm.continuationBookAnalysisSections.length === 0;

  const hasSelectedContinuationSource = basicForm.continuationSourceType === "novel"
    ? Boolean(basicForm.sourceNovelId)
    : Boolean(basicForm.sourceKnowledgeDocumentId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>基本信息</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          value={basicForm.title}
          placeholder="小说标题"
          onChange={(event) => onFormChange({ title: event.target.value })}
        />
        <Input
          value={basicForm.description}
          placeholder="小说简介"
          onChange={(event) => onFormChange({ description: event.target.value })}
        />
        <select
          className="w-full rounded-md border bg-background p-2 text-sm"
          value={basicForm.worldId}
          onChange={(event) => onFormChange({ worldId: event.target.value })}
        >
          <option value="">不绑定世界观</option>
          {worldOptions.map((world) => (
            <option key={world.id} value={world.id}>
              {world.name}
            </option>
          ))}
        </select>

        <div className="space-y-2">
          <div className="text-sm font-medium">创作类型</div>
          <div className="flex items-center gap-2">
            <Button
              variant={basicForm.writingMode === "original" ? "default" : "secondary"}
              onClick={() => onFormChange({ writingMode: "original" })}
            >
              原创
            </Button>
            <Button
              variant={basicForm.writingMode === "continuation" ? "default" : "secondary"}
              onClick={() => onFormChange({ writingMode: "continuation" })}
            >
              续写
            </Button>
          </div>
        </div>

        {basicForm.writingMode === "continuation" ? (
          <div className="space-y-2">
            <div className="text-sm font-medium">续写来源</div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={basicForm.continuationSourceType === "novel" ? "default" : "secondary"}
                onClick={() => onFormChange({ continuationSourceType: "novel" })}
              >
                站内小说
              </Button>
              <Button
                size="sm"
                variant={basicForm.continuationSourceType === "knowledge_document" ? "default" : "secondary"}
                onClick={() => onFormChange({ continuationSourceType: "knowledge_document" })}
              >
                知识库小说
              </Button>
            </div>

            {basicForm.continuationSourceType === "novel" ? (
              <select
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={basicForm.sourceNovelId}
                onChange={(event) => onFormChange({ sourceNovelId: event.target.value })}
              >
                <option value="">请选择前作小说</option>
                {sourceNovelOptions.map((novel) => (
                  <option key={novel.id} value={novel.id}>
                    {novel.title}
                  </option>
                ))}
              </select>
            ) : (
              <select
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={basicForm.sourceKnowledgeDocumentId}
                onChange={(event) => onFormChange({ sourceKnowledgeDocumentId: event.target.value })}
              >
                <option value="">请选择知识库小说</option>
                {sourceKnowledgeOptions.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.title}
                  </option>
                ))}
              </select>
            )}

            {hasSelectedContinuationSource ? (
              <div className="space-y-2 rounded-md border p-3">
                <div className="text-sm font-medium">续写拆书引用（结构化）</div>
                <select
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  value={basicForm.continuationBookAnalysisId}
                  onChange={(event) => {
                    const nextAnalysisId = event.target.value;
                    onFormChange({
                      continuationBookAnalysisId: nextAnalysisId,
                      continuationBookAnalysisSections: nextAnalysisId
                        ? (
                          basicForm.continuationBookAnalysisSections.length > 0
                            ? basicForm.continuationBookAnalysisSections
                            : availableBookAnalysisSections.map((item) => item.key)
                        )
                        : [],
                    });
                  }}
                >
                  <option value="">不引用拆书</option>
                  {sourceNovelBookAnalysisOptions.map((analysis) => (
                    <option key={analysis.id} value={analysis.id}>
                      {analysis.title} | {analysis.documentTitle} v{analysis.documentVersionNumber}
                    </option>
                  ))}
                </select>

                {isLoadingSourceNovelBookAnalyses ? (
                  <div className="text-xs text-muted-foreground">正在加载当前来源可用拆书...</div>
                ) : null}
                {!isLoadingSourceNovelBookAnalyses && sourceNovelBookAnalysisOptions.length === 0 ? (
                  <div className="text-xs text-muted-foreground">
                    当前续写来源暂无可用拆书结果（需要存在成功的拆书分析）。
                  </div>
                ) : null}

                {basicForm.continuationBookAnalysisId ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>选择要注入生成上下文的拆书章节：</span>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        onClick={() => onFormChange({
                          continuationBookAnalysisSections: availableBookAnalysisSections.map((item) => item.key),
                        })}
                      >
                        全选
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        onClick={() => onFormChange({ continuationBookAnalysisSections: [] })}
                      >
                        清空
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {availableBookAnalysisSections.map((section) => (
                        <label key={section.key} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={basicForm.continuationBookAnalysisSections.includes(section.key)}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              const next = checked
                                ? [...basicForm.continuationBookAnalysisSections, section.key]
                                : basicForm.continuationBookAnalysisSections.filter((item) => item !== section.key);
                              onFormChange({
                                continuationBookAnalysisSections: Array.from(new Set(next)),
                              });
                            }}
                          />
                          <span>{section.title}</span>
                        </label>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      续写并引用拆书时，故事时间线会在后续生成流程中自动作为高权重上下文。
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <Button
            variant={basicForm.status === "draft" ? "default" : "secondary"}
            onClick={() => onFormChange({ status: "draft" })}
          >
            草稿
          </Button>
          <Button
            variant={basicForm.status === "published" ? "default" : "secondary"}
            onClick={() => onFormChange({ status: "published" })}
          >
            已发布
          </Button>
        </div>

        <Button onClick={onSave} disabled={isSaving || continuationSourceMissing || continuationAnalysisSectionMissing}>
          {isSaving ? "保存中..." : "保存基本信息"}
        </Button>
      </CardContent>
    </Card>
  );
}
