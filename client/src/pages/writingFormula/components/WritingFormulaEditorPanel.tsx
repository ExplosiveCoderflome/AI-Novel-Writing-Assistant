import type { AntiAiRule, StyleProfile, StyleProfileFeature } from "@ai-novel/shared/types/styleEngine";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WritingFormulaEditorState {
  name: string;
  description: string;
  category: string;
  tags: string;
  applicableGenres: string;
  sourceContent: string;
  extractedFeatures: StyleProfileFeature[];
  analysisMarkdown: string;
  narrativeRules: string;
  characterRules: string;
  languageRules: string;
  rhythmRules: string;
  antiAiRuleIds: string[];
}

interface WritingFormulaEditorPanelProps {
  selectedProfile: StyleProfile | null;
  editor: WritingFormulaEditorState;
  antiAiRules: AntiAiRule[];
  savePending: boolean;
  deletePending: boolean;
  reextractPending: boolean;
  onEditorChange: (patch: Partial<WritingFormulaEditorState>) => void;
  onToggleExtractedFeature: (featureId: string, checked: boolean) => void;
  onReextractFeatures: () => void;
  onToggleAntiAiRule: (ruleId: string, checked: boolean) => void;
  onSave: () => void;
  onDelete: () => void;
}

export default function WritingFormulaEditorPanel(props: WritingFormulaEditorPanelProps) {
  const {
    selectedProfile,
    editor,
    antiAiRules,
    savePending,
    deletePending,
    reextractPending,
    onEditorChange,
    onToggleExtractedFeature,
    onReextractFeatures,
    onToggleAntiAiRule,
    onSave,
    onDelete,
  } = props;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>写法编辑</CardTitle>
          {selectedProfile ? (
            <Button size="sm" variant="destructive" onClick={onDelete} disabled={deletePending}>
              删除
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!selectedProfile ? (
          <div className="text-sm text-muted-foreground">请选择一个写法资产。</div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                className="rounded-md border p-2 text-sm"
                value={editor.name}
                onChange={(event) => onEditorChange({ name: event.target.value })}
              />
              <input
                className="rounded-md border p-2 text-sm"
                placeholder="分类"
                value={editor.category}
                onChange={(event) => onEditorChange({ category: event.target.value })}
              />
            </div>
            <textarea
              className="min-h-[80px] w-full rounded-md border p-2 text-sm"
              placeholder="简介"
              value={editor.description}
              onChange={(event) => onEditorChange({ description: event.target.value })}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <input
                className="rounded-md border p-2 text-sm"
                placeholder="标签，逗号分隔"
                value={editor.tags}
                onChange={(event) => onEditorChange({ tags: event.target.value })}
              />
              <input
                className="rounded-md border p-2 text-sm"
                placeholder="适用题材，逗号分隔"
                value={editor.applicableGenres}
                onChange={(event) => onEditorChange({ applicableGenres: event.target.value })}
              />
            </div>
            {selectedProfile.sourceType === "from_text" || editor.sourceContent.trim() ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">原文样本</div>
                <textarea
                  className="min-h-[140px] w-full rounded-md border p-2 text-sm"
                  placeholder="这套写法资产提取时使用的原文样本"
                  value={editor.sourceContent}
                  onChange={(event) => onEditorChange({ sourceContent: event.target.value })}
                />
                <div className="text-xs text-muted-foreground">
                  文本提取型写法会把原文样本一起保存，方便后续回看、比对和继续微调。
                </div>
              </div>
            ) : null}
            {selectedProfile.sourceType === "from_text" || editor.extractedFeatures.length > 0 ? (
              <div className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">提取特征启用</div>
                    <div className="text-xs text-muted-foreground">
                      这里会展示文本里提取到的全部特征，按项勾选启用。
                      {editor.extractedFeatures.length > 0 ? ` 当前共 ${editor.extractedFeatures.length} 项。` : ""}
                    </div>
                  </div>
                  {editor.sourceContent.trim() ? (
                    <Button size="sm" variant="outline" onClick={onReextractFeatures} disabled={reextractPending}>
                      {reextractPending ? "重提取中..." : "重新提取特征"}
                    </Button>
                  ) : null}
                </div>
                {editor.extractedFeatures.length > 0 ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    {editor.extractedFeatures.map((feature) => (
                      <label key={feature.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                        <input
                          type="checkbox"
                          checked={feature.enabled}
                          onChange={(event) => onToggleExtractedFeature(feature.id, event.target.checked)}
                        />
                        <span>
                          <span className="font-medium">{feature.label}</span>
                          <span className="ml-2 text-xs text-muted-foreground">[{feature.group}]</span>
                          <span className="mt-1 block text-xs text-muted-foreground">{feature.description}</span>
                          <span className="mt-1 block text-xs text-muted-foreground">证据：{feature.evidence}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    当前这条文本写法还没有生成可选特征条目，所以你现在看不到勾选项。
                    可以点右上角的“重新提取特征”，重新从原文样本生成完整特征池。
                  </div>
                )}
              </div>
            ) : null}
            <textarea
              className="min-h-[90px] w-full rounded-md border p-2 text-sm"
              placeholder="AI 草稿 / 分析说明"
              value={editor.analysisMarkdown}
              onChange={(event) => onEditorChange({ analysisMarkdown: event.target.value })}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <textarea
                className="min-h-[170px] rounded-md border p-2 font-mono text-xs"
                value={editor.narrativeRules}
                onChange={(event) => onEditorChange({ narrativeRules: event.target.value })}
              />
              <textarea
                className="min-h-[170px] rounded-md border p-2 font-mono text-xs"
                value={editor.characterRules}
                onChange={(event) => onEditorChange({ characterRules: event.target.value })}
              />
              <textarea
                className="min-h-[170px] rounded-md border p-2 font-mono text-xs"
                value={editor.languageRules}
                onChange={(event) => onEditorChange({ languageRules: event.target.value })}
              />
              <textarea
                className="min-h-[170px] rounded-md border p-2 font-mono text-xs"
                value={editor.rhythmRules}
                onChange={(event) => onEditorChange({ rhythmRules: event.target.value })}
              />
            </div>
            <div className="rounded-md border p-3">
              <div className="mb-2 text-sm font-medium">绑定反 AI 规则</div>
              <div className="grid gap-2 md:grid-cols-2">
                {antiAiRules.map((rule) => (
                  <label key={rule.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editor.antiAiRuleIds.includes(rule.id)}
                      onChange={(event) => onToggleAntiAiRule(rule.id, event.target.checked)}
                    />
                    <span>
                      <span className="font-medium">{rule.name}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{rule.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <Button onClick={onSave} disabled={savePending || !editor.name.trim()}>
              保存写法资产
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
