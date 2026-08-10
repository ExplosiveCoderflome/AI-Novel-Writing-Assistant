import { useTranslation } from "react-i18next";
import i18next from "i18next";
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
  const { t } = useTranslation();
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
        <CardTitle>{i18next.t("dict.gen_4f43fb8b")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-2xl border bg-slate-50/70 px-4 py-3 text-sm leading-7 text-slate-700">{i18next.t("writingFormula.writingFormulaWorkbenchPanel.l6d0oq")}</div>

        <div className="space-y-4 rounded-2xl border p-4">
          <div className="space-y-1">
            <div className="text-base font-semibold text-slate-950">{i18next.t("dict.gen_b3a2c9bd")}</div>
            <div className="text-sm leading-6 text-slate-500">{i18next.t("writingFormula.writingFormulaWorkbenchPanel.bugz9d")}</div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-900">{i18next.t("dict.gen_400e9d30")}</div>
              <SelectControl
                className="w-full rounded-md border p-2 text-sm"
                value={bindingForm.targetType}
                onChange={(event) => onBindingFormChange({ targetType: event.target.value as StyleBinding["targetType"] })}
              >
                <option value="novel">{i18next.t("dict.gen_82e75116")}</option>
                <option value="chapter">{i18next.t("dict.gen_9290b644")}</option>
                <option value="task">{i18next.t("dict.gen_e71d8d2f")}</option>
              </SelectControl>
            </label>

            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-900">{i18next.t("dict.gen_fedbdfeb")}</div>
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
                <div className="text-sm font-medium text-slate-900">{i18next.t("dict.gen_0ca66ea7")}</div>
                <SelectControl
                  className="w-full rounded-md border p-2 text-sm"
                  value={bindingForm.chapterId}
                  onChange={(event) => onBindingFormChange({ chapterId: event.target.value })}
                >
                  <option value="">{i18next.t("dict.gen_0ca66ea7")}</option>
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
                <div className="text-sm font-medium text-slate-900">{i18next.t("dict.taskId")}</div>
                <input
                  className="w-full rounded-md border p-2 text-sm"
                  placeholder={i18next.t("dict.exampleChapterDraft001")}
                  value={bindingForm.taskTargetId}
                  onChange={(event) => onBindingFormChange({ taskTargetId: event.target.value })}
                />
              </label>
            ) : null}

            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-900">{i18next.t("dict.priorityLevel")}</div>
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
              <div className="text-sm font-medium text-slate-900">{i18next.t("dict.gen_4aac5591")}</div>
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

          <Button onClick={onCreateBinding} disabled={createBindingPending || !selectedProfileId}>{i18next.t("writingFormula.writingFormulaWorkbenchPanel.arc12g")}</Button>

          <div className="space-y-2">
            {bindings.length > 0 ? (
              bindings.map((binding) => (
                <div key={binding.id} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
                  <span>{binding.targetType} / {binding.targetId} / P{binding.priority} / W{binding.weight}</span>
                  <Button size="sm" variant="ghost" onClick={() => onDeleteBinding(binding.id)}>{i18next.t("dict.gen_2f4aaddd")}</Button>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed px-3 py-3 text-sm leading-6 text-slate-500">{i18next.t("writingFormula.writingFormulaWorkbenchPanel.n1q7ra")}</div>
            )}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border p-4">
          <div className="space-y-1">
            <div className="text-base font-semibold text-slate-950">{i18next.t("dict.gen_e07b94bf")}</div>
            <div className="text-sm leading-6 text-slate-500">{i18next.t("writingFormula.writingFormulaWorkbenchPanel.esoi5s")}</div>
          </div>

          <label className="space-y-2">
            <div className="text-sm font-medium text-slate-900">{i18next.t("dict.gen_4c1b6aa3")}</div>
            <SelectControl
              className="w-full rounded-md border p-2 text-sm"
              value={testWriteForm.mode}
              onChange={(event) => onTestWriteFormChange({ mode: event.target.value as "generate" | "rewrite" })}
            >
              <option value="generate">{i18next.t("dict.gen_df396e50")}</option>
              <option value="rewrite">{i18next.t("dict.gen_9492bce4")}</option>
            </SelectControl>
          </label>

          {testWriteForm.mode === "generate" ? (
            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-900">{i18next.t("dict.gen_845b9dd6")}</div>
              <input
                className="w-full rounded-md border p-2 text-sm"
                placeholder={i18next.t("dict.exampleMainFirstPublicFlip")}
                value={testWriteForm.topic}
                onChange={(event) => onTestWriteFormChange({ topic: event.target.value })}
              />
            </label>
          ) : (
            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-900">{i18next.t("dict.gen_e678a74f")}</div>
              <textarea
                className="min-h-[140px] w-full rounded-md border p-2 text-sm"
                placeholder={i18next.t("dict.gen_a75a22c6")}
                value={testWriteForm.sourceText}
                onChange={(event) => onTestWriteFormChange({ sourceText: event.target.value })}
              />
            </label>
          )}

          <Button onClick={onRunTestWrite} disabled={testWritePending || !selectedProfileId}>{i18next.t("writingFormula.writingFormulaWorkbenchPanel.czfzs9")}</Button>

          {testWriteOutput ? (
            <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-xl border bg-muted/20 p-4 text-sm">
              {testWriteOutput}
            </pre>
          ) : (
            <div className="rounded-xl border border-dashed px-3 py-3 text-sm leading-6 text-slate-500">{i18next.t("writingFormula.writingFormulaWorkbenchPanel.ew32nl")}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
