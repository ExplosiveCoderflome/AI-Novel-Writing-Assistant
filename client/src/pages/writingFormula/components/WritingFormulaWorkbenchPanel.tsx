import type { StyleBinding } from "@ai-novel/shared/types/styleEngine";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
        <CardTitle>当前写法的应用与测试</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-2xl border bg-slate-50/70 px-4 py-3 text-sm leading-7 text-slate-700">
          这里只处理两件事：把这套写法绑定到小说/章节/任务，以及先试写一段看看效果。
          “去 AI 味”已经拆成独立入口，不再和这里混在一起。
        </div>

        <div className="space-y-4 rounded-2xl border p-4">
          <div className="space-y-1">
            <div className="text-base font-semibold text-slate-950">绑定到目标</div>
            <div className="text-sm leading-6 text-slate-500">
              绑定后，这套写法会在对应小说、章节或任务里参与生成。优先级越高，影响越靠前；权重越高，参与程度越强。
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-900">绑定层级</div>
              <select
                className="w-full rounded-md border p-2 text-sm"
                value={bindingForm.targetType}
                onChange={(event) => onBindingFormChange({ targetType: event.target.value as StyleBinding["targetType"] })}
              >
                <option value="novel">整本书</option>
                <option value="chapter">章节</option>
                <option value="task">本次任务</option>
              </select>
            </label>

            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-900">所属小说</div>
              <select
                className="w-full rounded-md border p-2 text-sm"
                value={bindingForm.novelId}
                onChange={(event) => onBindingFormChange({ novelId: event.target.value, chapterId: "" })}
              >
                {novelOptions.map((novel) => <option key={novel.id} value={novel.id}>{novel.title}</option>)}
              </select>
            </label>

            {bindingForm.targetType === "chapter" ? (
              <label className="space-y-2">
                <div className="text-sm font-medium text-slate-900">选择章节</div>
                <select
                  className="w-full rounded-md border p-2 text-sm"
                  value={bindingForm.chapterId}
                  onChange={(event) => onBindingFormChange({ chapterId: event.target.value })}
                >
                  <option value="">选择章节</option>
                  {chapterOptions.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {chapter.order}. {chapter.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {bindingForm.targetType === "task" ? (
              <label className="space-y-2">
                <div className="text-sm font-medium text-slate-900">任务标识</div>
                <input
                  className="w-full rounded-md border p-2 text-sm"
                  placeholder="例如：chapter-draft-001"
                  value={bindingForm.taskTargetId}
                  onChange={(event) => onBindingFormChange({ taskTargetId: event.target.value })}
                />
              </label>
            ) : null}

            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-900">优先级</div>
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
              <div className="text-sm font-medium text-slate-900">权重</div>
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
                  <Button size="sm" variant="ghost" onClick={() => onDeleteBinding(binding.id)}>删除</Button>
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
            <div className="text-base font-semibold text-slate-950">先试写一段</div>
            <div className="text-sm leading-6 text-slate-500">
              不确定这套写法到底有没有落地成功时，先生成一段或改写一段，是最直观的验证方式。
            </div>
          </div>

          <label className="space-y-2">
            <div className="text-sm font-medium text-slate-900">试写方式</div>
            <select
              className="w-full rounded-md border p-2 text-sm"
              value={testWriteForm.mode}
              onChange={(event) => onTestWriteFormChange({ mode: event.target.value as "generate" | "rewrite" })}
            >
              <option value="generate">生成正文</option>
              <option value="rewrite">改写文本</option>
            </select>
          </label>

          {testWriteForm.mode === "generate" ? (
            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-900">试写主题</div>
              <input
                className="w-full rounded-md border p-2 text-sm"
                placeholder="例如：主角第一次公开翻盘"
                value={testWriteForm.topic}
                onChange={(event) => onTestWriteFormChange({ topic: event.target.value })}
              />
            </label>
          ) : (
            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-900">待改写文本</div>
              <textarea
                className="min-h-[140px] w-full rounded-md border p-2 text-sm"
                placeholder="粘贴你想用这套写法改写的正文"
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
