import type { StyleExtractionDraft } from "@ai-novel/shared/types/styleEngine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WritingFormulaImitateFlowProps {
  form: {
    name: string;
    category: string;
    sourceText: string;
  };
  draft: StyleExtractionDraft | null;
  selectedPresetKey: "imitate" | "balanced" | "transfer";
  extractPending: boolean;
  createPending: boolean;
  onFormChange: (patch: Partial<WritingFormulaImitateFlowProps["form"]>) => void;
  onExtract: () => void;
  onPresetChange: (value: "imitate" | "balanced" | "transfer") => void;
  onCreate: () => void;
}

export default function WritingFormulaImitateFlow(props: WritingFormulaImitateFlowProps) {
  const {
    form,
    draft,
    selectedPresetKey,
    extractPending,
    createPending,
    onFormChange,
    onExtract,
    onPresetChange,
    onCreate,
  } = props;

  return (
    <Card className="border-slate-200/80 bg-white/90 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
      <CardHeader>
        <CardTitle>模仿一种写法</CardTitle>
        <div className="text-sm leading-7 text-muted-foreground">
          你先给我一段明确的参考文本，我把它拆成可执行写法，再决定是贴近模仿、保留骨架，还是只迁移可复用部分。
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
          <section className="space-y-3 rounded-2xl border bg-slate-50/70 p-4">
            <div className="text-sm font-medium text-slate-900">1. 输入参考文本</div>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                className="rounded-md border bg-white p-2 text-sm"
                placeholder="写法名称，例如：冷感现实对话流"
                value={form.name}
                onChange={(event) => onFormChange({ name: event.target.value })}
              />
              <input
                className="rounded-md border bg-white p-2 text-sm"
                placeholder="分类（可选）"
                value={form.category}
                onChange={(event) => onFormChange({ category: event.target.value })}
              />
            </div>
            <textarea
              className="min-h-[280px] w-full rounded-xl border bg-white p-3 text-sm leading-7"
              placeholder="粘贴你想模仿的参考文本。建议至少给一段完整场景，让系统能看出叙事距离、对白手感和句式节奏。"
              value={form.sourceText}
              onChange={(event) => onFormChange({ sourceText: event.target.value })}
            />
            <div className="flex justify-end">
              <Button type="button" onClick={onExtract} disabled={!form.name.trim() || !form.sourceText.trim() || extractPending}>
                {extractPending ? "正在提取特征..." : "2. 先提取特征"}
              </Button>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border bg-white p-4">
            <div className="text-sm font-medium text-slate-900">2. 选择保留程度</div>
            {draft ? (
              <>
                <div className="rounded-xl border bg-slate-50/70 p-3 text-sm leading-7 text-slate-600">
                  {draft.summary}
                </div>
                <div className="grid gap-3">
                  {draft.presets.map((preset) => {
                    const active = preset.key === selectedPresetKey;
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        className={`rounded-2xl border px-4 py-4 text-left transition ${active ? "border-slate-950 bg-slate-950 text-white shadow-lg" : "border-slate-200 bg-white hover:border-slate-400"}`}
                        onClick={() => onPresetChange(preset.key)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-base font-semibold">{preset.label}</div>
                          {active ? <Badge variant="secondary" className="bg-white/10 text-white">当前方案</Badge> : null}
                        </div>
                        <div className={`mt-2 text-sm leading-7 ${active ? "text-slate-200" : "text-slate-600"}`}>
                          {preset.summary}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="rounded-xl border bg-amber-50/80 p-3 text-xs leading-6 text-amber-900">
                  `imitate` 更适合临摹试写，`balanced` 适合大多数项目，`transfer` 更适合整书绑定，能主动避开高指纹风险。
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed p-4 text-sm leading-7 text-muted-foreground">
                先完成特征提取，这里才会出现三种保留策略和对应的读感说明。
              </div>
            )}
          </section>
        </div>

        <section className="rounded-2xl border bg-white p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-slate-900">3. 预览即将保存的写法骨架</div>
              <div className="mt-1 text-xs leading-6 text-muted-foreground">
                保存后会自动进入当前写法编辑，你可以继续调整规则、绑定到目标，或者直接拿去试写。
              </div>
            </div>
            <Button type="button" onClick={onCreate} disabled={!draft || createPending}>
              {createPending ? "正在保存写法..." : "4. 保存为写法资产"}
            </Button>
          </div>
          {draft ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {draft.features.slice(0, 6).map((feature) => (
                <div key={feature.id} className="rounded-xl border bg-slate-50/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-slate-900">{feature.label}</div>
                    <Badge variant="outline">{feature.group}</Badge>
                  </div>
                  <div className="mt-2 text-xs leading-6 text-slate-600">{feature.description}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              还没有可预览的特征。先完成特征提取，再决定保存方式。
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
