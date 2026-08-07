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
        <CardTitle>Application and testing of current writing methods</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-2xl border bg-slate-50/70 px-4 py-3 text-sm leading-7 text-slate-700">
          There are only two things to deal with here: binding this writing method to the novel/chapter/task, and trying to write a paragraph to see the effect.
                            "Remove AI flavor" has been separated into a separate entrance and is no longer mixed with this place.
                          </div>

        <div className="space-y-4 rounded-2xl border p-4">
          <div className="space-y-1">
            <div className="text-base font-semibold text-slate-950">Bind to target</div>
            <div className="text-sm leading-6 text-slate-500">
              After binding, this writing method will be generated in the corresponding novel, chapter or task. The higher the priority, the higher the influence; the higher the weight, the stronger the degree of participation.
                                      </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-900">Binding level</div>
              <SelectControl
                className="w-full rounded-md border p-2 text-sm"
                value={bindingForm.targetType}
                onChange={(event) => onBindingFormChange({ targetType: event.target.value as StyleBinding["targetType"] })}
              >
                <option value="novel">Whole book</option>
                <option value="chapter">chapter</option>
                <option value="task">This mission</option>
              </SelectControl>
            </label>

            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-900">Affiliated novel</div>
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
                <div className="text-sm font-medium text-slate-900">Select chapter</div>
                <SelectControl
                  className="w-full rounded-md border p-2 text-sm"
                  value={bindingForm.chapterId}
                  onChange={(event) => onBindingFormChange({ chapterId: event.target.value })}
                >
                  <option value="">Select chapter</option>
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
                <div className="text-sm font-medium text-slate-900">Task ID</div>
                <input
                  className="w-full rounded-md border p-2 text-sm"
                  placeholder="For example: chapter-draft-001"
                  value={bindingForm.taskTargetId}
                  onChange={(event) => onBindingFormChange({ taskTargetId: event.target.value })}
                />
              </label>
            ) : null}

            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-900">Priority</div>
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
              <div className="text-sm font-medium text-slate-900">Weight</div>
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
            Create binding
                                </Button>

          <div className="space-y-2">
            {bindings.length > 0 ? (
              bindings.map((binding) => (
                <div key={binding.id} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
                  <span>{binding.targetType} / {binding.targetId} / P{binding.priority} / W{binding.weight}</span>
                  <Button size="sm" variant="ghost" onClick={() => onDeleteBinding(binding.id)}>delete</Button>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed px-3 py-3 text-sm leading-6 text-slate-500">
                This set of writing is not yet tied to any target. Bind it to the novel or chapter first, and then the subsequent generated links will automatically bring it.
                                                </div>
            )}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border p-4">
          <div className="space-y-1">
            <div className="text-base font-semibold text-slate-950">Try writing a paragraph first</div>
            <div className="text-sm leading-6 text-slate-500">
              When you are not sure whether this writing method has been successfully implemented, creating or rewriting a paragraph is the most intuitive way to verify it.
                                      </div>
          </div>

          <label className="space-y-2">
            <div className="text-sm font-medium text-slate-900">Trial writing method</div>
            <SelectControl
              className="w-full rounded-md border p-2 text-sm"
              value={testWriteForm.mode}
              onChange={(event) => onTestWriteFormChange({ mode: event.target.value as "generate" | "rewrite" })}
            >
              <option value="generate">Generate text</option>
              <option value="rewrite">Rewrite text</option>
            </SelectControl>
          </label>

          {testWriteForm.mode === "generate" ? (
            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-900">Test writing theme</div>
              <input
                className="w-full rounded-md border p-2 text-sm"
                placeholder="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
                value={testWriteForm.topic}
                onChange={(event) => onTestWriteFormChange({ topic: event.target.value })}
              />
            </label>
          ) : (
            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-900">Text to be rewritten</div>
              <textarea
                className="min-h-[140px] w-full rounded-md border p-2 text-sm"
                placeholder="Paste the text you want to rewrite using this style of writing"
                value={testWriteForm.sourceText}
                onChange={(event) => onTestWriteFormChange({ sourceText: event.target.value })}
              />
            </label>
          )}

          <Button onClick={onRunTestWrite} disabled={testWritePending || !selectedProfileId}>
            Perform trial writing
                                </Button>

          {testWriteOutput ? (
            <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-xl border bg-muted/20 p-4 text-sm">
              {testWriteOutput}
            </pre>
          ) : (
            <div className="rounded-xl border border-dashed px-3 py-3 text-sm leading-6 text-slate-500">
              Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.
                                          </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
