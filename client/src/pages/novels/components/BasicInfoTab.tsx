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
    projectMode: "ai_led" | "co_pilot" | "draft_mode" | "auto_pipeline";
    narrativePov: "first_person" | "third_person" | "mixed";
    pacePreference: "slow" | "balanced" | "fast";
    styleTone: string;
    emotionIntensity: "low" | "medium" | "high";
    aiFreedom: "low" | "medium" | "high";
    defaultChapterLength: number;
    projectStatus: "not_started" | "in_progress" | "completed" | "rework" | "blocked";
    storylineStatus: "not_started" | "in_progress" | "completed" | "rework" | "blocked";
    outlineStatus: "not_started" | "in_progress" | "completed" | "rework" | "blocked";
    resourceReadyScore: number;
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

        <div className="grid gap-2 md:grid-cols-2">
          <select
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={basicForm.projectMode}
            onChange={(event) => onFormChange({ projectMode: event.target.value as BasicInfoTabProps["basicForm"]["projectMode"] })}
          >
            <option value="ai_led">AI 接管</option>
            <option value="co_pilot">AI 副驾</option>
            <option value="draft_mode">草稿优先</option>
            <option value="auto_pipeline">流水线优先</option>
          </select>
          <select
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={basicForm.narrativePov}
            onChange={(event) => onFormChange({ narrativePov: event.target.value as BasicInfoTabProps["basicForm"]["narrativePov"] })}
          >
            <option value="first_person">第一人称</option>
            <option value="third_person">第三人称</option>
            <option value="mixed">混合视角</option>
          </select>
          <select
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={basicForm.pacePreference}
            onChange={(event) => onFormChange({ pacePreference: event.target.value as BasicInfoTabProps["basicForm"]["pacePreference"] })}
          >
            <option value="slow">慢节奏</option>
            <option value="balanced">均衡</option>
            <option value="fast">快节奏</option>
          </select>
          <select
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={basicForm.emotionIntensity}
            onChange={(event) => onFormChange({ emotionIntensity: event.target.value as BasicInfoTabProps["basicForm"]["emotionIntensity"] })}
          >
            <option value="low">低情绪浓度</option>
            <option value="medium">中情绪浓度</option>
            <option value="high">高情绪浓度</option>
          </select>
          <select
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={basicForm.aiFreedom}
            onChange={(event) => onFormChange({ aiFreedom: event.target.value as BasicInfoTabProps["basicForm"]["aiFreedom"] })}
          >
            <option value="low">低自由度</option>
            <option value="medium">中自由度</option>
            <option value="high">高自由度</option>
          </select>
          <Input
            type="number"
            min={500}
            max={10000}
            value={basicForm.defaultChapterLength}
            placeholder="默认章节字数"
            onChange={(event) => onFormChange({ defaultChapterLength: Number(event.target.value || 0) || 2000 })}
          />
          <select
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={basicForm.projectStatus}
            onChange={(event) => onFormChange({ projectStatus: event.target.value as BasicInfoTabProps["basicForm"]["projectStatus"] })}
          >
            <option value="not_started">项目未开始</option>
            <option value="in_progress">项目进行中</option>
            <option value="completed">项目已完成</option>
            <option value="rework">项目返工</option>
            <option value="blocked">项目阻塞</option>
          </select>
          <select
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={basicForm.storylineStatus}
            onChange={(event) => onFormChange({ storylineStatus: event.target.value as BasicInfoTabProps["basicForm"]["storylineStatus"] })}
          >
            <option value="not_started">主线未开始</option>
            <option value="in_progress">主线进行中</option>
            <option value="completed">主线已完成</option>
            <option value="rework">主线返工</option>
            <option value="blocked">主线阻塞</option>
          </select>
          <select
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={basicForm.outlineStatus}
            onChange={(event) => onFormChange({ outlineStatus: event.target.value as BasicInfoTabProps["basicForm"]["outlineStatus"] })}
          >
            <option value="not_started">大纲未开始</option>
            <option value="in_progress">大纲进行中</option>
            <option value="completed">大纲已完成</option>
            <option value="rework">大纲返工</option>
            <option value="blocked">大纲阻塞</option>
          </select>
          <Input
            type="number"
            min={0}
            max={100}
            value={basicForm.resourceReadyScore}
            placeholder="资源完备度(0-100)"
            onChange={(event) => onFormChange({ resourceReadyScore: Math.max(0, Math.min(100, Number(event.target.value || 0))) })}
          />
        </div>
        <Input
          value={basicForm.styleTone}
          placeholder="文风关键词（例如：冷峻、克制、黑色幽默）"
          onChange={(event) => onFormChange({ styleTone: event.target.value })}
        />

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
