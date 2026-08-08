import type { StyleBinding } from "@ai-novel/shared/types/styleEngine";
import { BookOpenText, FlaskConical, Link2, Sparkles } from "lucide-react";
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

  const bindingTargetLabel: Record<StyleBinding["targetType"], string> = {
    novel: "整本书",
    chapter: "章节",
    task: "本次任务",
  };

  return (
    <Card className="border-slate-200/80 bg-white shadow-none">
      <CardHeader className="border-b border-slate-100 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
            <FlaskConical className="size-5" />
          </div>
          <div>
            <CardTitle>把写法放进故事里验证</CardTitle>
            <div className="mt-1 text-sm text-slate-500">先试读感，再决定让它在哪个创作环节生效。</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="flex gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm leading-7 text-slate-700">
          <Sparkles className="mt-1 size-4 shrink-0 text-sky-700" />
          <span>这里负责绑定与试写。想修正已有正文时，请从“去 AI 味”进入，避免把写法设定和正文处理混在一起。</span>
        </div>

        <div className="space-y-5 rounded-3xl border border-slate-200 bg-[linear-gradient(135deg,rgba(248,250,252,0.96),rgba(255,255,255,0.96))] p-4 md:p-5">
          <div className="flex gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-800 shadow-sm ring-1 ring-slate-200"><Link2 className="size-4" /></div>
            <div className="space-y-1">
              <div className="text-base font-semibold text-slate-950">绑定到目标</div>
            <div className="text-sm leading-6 text-slate-500">
              绑定后，这套写法会在对应小说、章节或任务里参与生成。优先级越高，影响越靠前；权重越高，参与程度越强。
            </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-900">绑定层级</div>
              <SelectControl
                className="w-full rounded-md border p-2 text-sm"
                value={bindingForm.targetType}
                onChange={(event) => onBindingFormChange({ targetType: event.target.value as StyleBinding["targetType"] })}
              >
                <option value="novel">整本书</option>
                <option value="chapter">章节</option>
                <option value="task">本次任务</option>
              </SelectControl>
            </label>

            <label className="space-y-2">
              <div className="text-sm font-medium text-slate-900">所属小说</div>
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
                <div className="text-sm font-medium text-slate-900">选择章节</div>
                <SelectControl
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
                </SelectControl>
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
            <Link2 className="size-4" />
            创建绑定
          </Button>

          <div className="space-y-2">
            {bindings.length > 0 ? (
              bindings.map((binding) => (
                <div key={binding.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">{bindingTargetLabel[binding.targetType]}</div>
                    <div className="mt-1 truncate text-xs text-slate-500">目标 {binding.targetId} · 优先级 {binding.priority} · 影响 {binding.weight}</div>
                  </div>
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

        <div className="space-y-5 rounded-3xl border border-slate-200 p-4 md:p-5">
          <div className="flex gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-800 ring-1 ring-amber-100"><BookOpenText className="size-4" /></div>
            <div className="space-y-1">
              <div className="text-base font-semibold text-slate-950">先试写一段</div>
            <div className="text-sm leading-6 text-slate-500">
              不确定这套写法到底有没有落地成功时，先生成一段或改写一段，是最直观的验证方式。
            </div>
            </div>
          </div>

          <label className="space-y-2">
            <div className="text-sm font-medium text-slate-900">试写方式</div>
            <SelectControl
              className="w-full rounded-md border p-2 text-sm"
              value={testWriteForm.mode}
              onChange={(event) => onTestWriteFormChange({ mode: event.target.value as "generate" | "rewrite" })}
            >
              <option value="generate">生成正文</option>
              <option value="rewrite">改写文本</option>
            </SelectControl>
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
            <FlaskConical className="size-4" />
            {testWritePending ? "正在试写..." : "开始试写"}
          </Button>

          {testWriteOutput ? (
            <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm leading-7 text-slate-100">
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
