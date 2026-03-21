import type { AntiAiRule, StyleProfile } from "@ai-novel/shared/types/styleEngine";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WritingFormulaEditorState {
  name: string;
  description: string;
  category: string;
  tags: string;
  applicableGenres: string;
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
  onEditorChange: (patch: Partial<WritingFormulaEditorState>) => void;
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
    onEditorChange,
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
