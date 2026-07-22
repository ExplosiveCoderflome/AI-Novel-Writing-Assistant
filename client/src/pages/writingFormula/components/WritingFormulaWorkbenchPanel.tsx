import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { StyleBinding } from "@ai-novel/shared/types/styleEngine";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SelectControl from "@/components/common/SelectControl";

interface BindingFormState {
  targetType: StyleBinding["targetType"];
  novelId: string;
  chapterId: string;
  taskTargetId: string;
  priority: number;
  weight: number;
}

interface TestWriteFormState {
  mode: "generate" | "rewrite";
  topic: string;
  sourceText: string;
  targetLength: number;
}

interface WritingFormulaWorkbenchPanelProps {
  selectedProfileId: string;
  bindingForm: BindingFormState;
  bindings: StyleBinding[];
  novelOptions: Array<{ id: string; title: string }>;
  chapterOptions: Array<{ id: string; order: number; title: string }>;
  createBindingPending: boolean;
  onBindingFormChange: (patch: Partial<BindingFormState>) => void;
  onCreateBinding: () => void;
  onDeleteBinding: (bindingId: string) => void;
  testWriteForm: TestWriteFormState;
  testWriteOutput: string;
  testWritePending: boolean;
  onTestWriteFormChange: (patch: Partial<TestWriteFormState>) => void;
  onRunTestWrite: () => void;
}

export default function WritingFormulaWorkbenchPanel(props: WritingFormulaWorkbenchPanelProps) {
  const {
    selectedProfileId,
    bindingForm,
    bindings,
    novelOptions,
    chapterOptions,
    createBindingPending,
    onBindingFormChange,
    onCreateBinding,
    onDeleteBinding,
    testWriteForm,
    testWriteOutput,
    testWritePending,
    onTestWriteFormChange,
    onRunTestWrite,
  } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("gen.pages.writingFormula.components.WritingFormulaWorkbenchPanel.gen_4f43fb8b")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-2xl border bg-slate-50/70 px-4 py-3 text-sm leading-7 text-slate-700">
          这里只处理两件事：把这套写法绑定到小说/章节/任务，以及先试写一段看看效果。
          “去 AI 味”已经拆成独立入口，不再和这里混在一起。
        </div>

        <div className="space-y-4 rounded-2xl border p-4">
          <div className="space-y-1">
            <div className="text-base font-semibold text-slate-950">{t("gen.pages.writingFormula.components.WritingFormulaWorkbenchPanel.gen_b3a2c9bd")}</div>
            <div className="text-sm leading-6 text-slate-500">
              绑定后，这套写法会在对应小说、章节或任务里参与生成。优先级越高，影响越靠前；权重越高，参与程度越强。
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-900">{t("gen.pages.writingFormula.components.WritingFormulaWorkbenchPanel.gen_400e9d30")}</div>
              <SelectControl
                className="w-full rounded-md border p-2 text-sm"
                value={bindingForm.targetType}
                onChange={(event) => onBindingFormChange({ targetType: event.target.value as StyleBinding["targetType"] })}
              >
                <option value="novel">{t("gen.pages.writingFormula.components.WritingFormulaWorkbenchPanel.gen_82e75116")}</option>
                <option value="chapter">{t("gen.pages.writingFormula.components.WritingFormulaWorkbenchPanel.gen_9290b644")}</option>
                <option value="task">{t("gen.pages.writingFormula.components.WritingFormulaWorkbenchPanel.gen_e71d8d2f")}</option>
              </SelectControl>
            </label>

            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-900">{t("gen.pages.writingFormula.components.WritingFormulaWorkbenchPanel.gen_fedbdfeb")}</div>
              <SelectControl
                className="w-full rounded-md border p-2 text-sm"
                value={bindingForm.novelId}
                onChange={(event) => onBindingFormChange({ novelId: event.target.value, chapterId: "" })}
              >
                {novelOptions.map((novel) => <option key={novel.id} value={novel.id}>{novel.title}</option>)}
              </SelectControl>
            </label>

            {bindingForm.targetType === "chapter" ? (
              <label className="space-y-2">
                <div className="text-sm font-medium text-slate-900">{t("gen.pages.writingFormula.components.WritingFormulaWorkbenchPanel.gen_0ca66ea7")}</div>
                <SelectControl
                  className="w-full rounded-md border p-2 text-sm"
                  value={bindingForm.chapterId}
                  onChange={(event) => onBindingFormChange({ chapterId: event.target.value })}
                >
                  <option value="">{t("gen.pages.writingFormula.components.WritingFormulaWorkbenchPanel.gen_0ca66ea7")}</option>
                  {chapterOptions.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {chapter.order}. {chapter.title}
                    </option>
                  ))}
                </SelectControl>
              </label>
            ) : null}

            {bindingForm.targetType === "task" ? (
              <label className="space-y-2">
                <div className="text-sm font-medium text-slate-900">{t("gen.pages.writingFormula.components.WritingFormulaWorkbenchPanel.taskId")}</div>
                <input
                  className="w-full rounded-md border p-2 text-sm"
                  placeholder={t("gen.pages.writingFormula.components.WritingFormulaWorkbenchPanel.exampleChapterDraft001")}
                  value={bindingForm.taskTargetId}
                  onChange={(event) => onBindingFormChange({ taskTargetId: event.target.value })}
                />
              </label>
            ) : null}

            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-900">{t("gen.pages.writingFormula.components.WritingFormulaWorkbenchPanel.priorityLevel")}</div>
              <input
                className="w-full rounded-md border p-2 text-sm"
                type="number"
                min={0}
                max={99}
                value={bindingForm.priority}
                onChange={(event) => onBindingFormChange({ priority: Number(event.target.value) || 1 })}
              />
            </label>

            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-900">{t("gen.pages.writingFormula.components.WritingFormulaWorkbenchPanel.gen_4aac5591")}</div>
              <input
                className="w-full rounded-md border p-2 text-sm"
                type="number"
                min={0.3}
                max={1}
                step={0.1}
                value={bindingForm.weight}
                onChange={(event) => onBindingFormChange({ weight: Number(event.target.value) || 1 })}
              />
            </label>
          </div>

          <Button onClick={onCreateBinding} disabled={createBindingPending || !selectedProfileId}>
            创建绑定
          </Button>

          <div className="space-y-2">
            {bindings.length > 0 ? (
              bindings.map((binding) => (
                <div key={binding.id} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
                  <span>{binding.targetType} / {binding.targetId} / P{binding.priority} / W{binding.weight}</span>
                  <Button size="sm" variant="ghost" onClick={() => onDeleteBinding(binding.id)}>{t("gen.pages.writingFormula.components.WritingFormulaWorkbenchPanel.gen_2f4aaddd")}</Button>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed px-3 py-3 text-sm leading-6 text-slate-500">
                这套写法还没有绑定到任何目标。先绑定到小说或章节，后面的生成链路才会自动带上它。
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border p-4">
          <div className="space-y-1">
            <div className="text-base font-semibold text-slate-950">{t("gen.pages.writingFormula.components.WritingFormulaWorkbenchPanel.gen_e07b94bf")}</div>
            <div className="text-sm leading-6 text-slate-500">
              不确定这套写法到底有没有落地成功时，先生成一段或改写一段，是最直观的验证方式。
            </div>
          </div>

          <label className="space-y-2">
            <div className="text-sm font-medium text-slate-900">{t("gen.pages.writingFormula.components.WritingFormulaWorkbenchPanel.gen_4c1b6aa3")}</div>
            <SelectControl
              className="w-full rounded-md border p-2 text-sm"
              value={testWriteForm.mode}
              onChange={(event) => onTestWriteFormChange({ mode: event.target.value as "generate" | "rewrite" })}
            >
              <option value="generate">{t("gen.pages.writingFormula.components.WritingFormulaWorkbenchPanel.gen_df396e50")}</option>
              <option value="rewrite">{t("gen.pages.writingFormula.components.WritingFormulaWorkbenchPanel.gen_9492bce4")}</option>
            </SelectControl>
          </label>

          {testWriteForm.mode === "generate" ? (
            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-900">{t("gen.pages.writingFormula.components.WritingFormulaWorkbenchPanel.gen_845b9dd6")}</div>
              <input
                className="w-full rounded-md border p-2 text-sm"
                placeholder={t("gen.pages.writingFormula.components.WritingFormulaWorkbenchPanel.exampleMainFirstPublicFlip")}
                value={testWriteForm.topic}
                onChange={(event) => onTestWriteFormChange({ topic: event.target.value })}
              />
            </label>
          ) : (
            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-900">{t("gen.pages.writingFormula.components.WritingFormulaWorkbenchPanel.gen_e678a74f")}</div>
              <textarea
                className="min-h-[140px] w-full rounded-md border p-2 text-sm"
                placeholder={t("gen.pages.writingFormula.components.WritingFormulaWorkbenchPanel.gen_a75a22c6")}
                value={testWriteForm.sourceText}
                onChange={(event) => onTestWriteFormChange({ sourceText: event.target.value })}
              />
            </label>
          )}

          <Button onClick={onRunTestWrite} disabled={testWritePending || !selectedProfileId}>
            执行试写
          </Button>

          {testWriteOutput ? (
            <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-xl border bg-muted/20 p-4 text-sm">
              {testWriteOutput}
            </pre>
          ) : (
            <div className="rounded-xl border border-dashed px-3 py-3 text-sm leading-6 text-slate-500">
              这里会显示试写结果。你可以用它判断这套写法的推进感、对白质感和整体语气是否已经到位。
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
