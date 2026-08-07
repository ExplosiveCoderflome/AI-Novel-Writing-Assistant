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
        <CardTitle>imitate a writing style</CardTitle>
        <div className="text-sm leading-7 text-muted-foreground">
          You first give me a clear reference text, I split it into executable writing, and then decide whether to imitate closely, retain the skeleton, or migrate only the reusable parts.
                          </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
          <section className="space-y-3 rounded-2xl border bg-slate-50/70 p-4">
            <div className="text-sm font-medium text-slate-900">1. Enter reference text</div>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                className="rounded-md border bg-white p-2 text-sm"
                placeholder="Writing method name, for example: cold reality dialogue flow"
                value={form.name}
                onChange={(event) => onFormChange({ name: event.target.value })}
              />
              <input
                className="rounded-md border bg-white p-2 text-sm"
                placeholder="Classification (optional)"
                value={form.category}
                onChange={(event) => onFormChange({ category: event.target.value })}
              />
            </div>
            <textarea
              className="min-h-[280px] w-full rounded-xl border bg-white p-3 text-sm leading-7"
              placeholder="Paste the reference text you want to imitate. It is recommended to give at least one complete scene so that the system can see the narrative distance, dialogue feel and sentence rhythm."
              value={form.sourceText}
              onChange={(event) => onFormChange({ sourceText: event.target.value })}
            />
            <div className="flex justify-end">
              <Button type="button" onClick={onExtract} disabled={!form.name.trim() || !form.sourceText.trim() || extractPending}>
                {extractPending ? "Extracting features..." : "2. Extract features first"}
              </Button>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border bg-white p-4">
            <div className="text-sm font-medium text-slate-900">2. Select retention level</div>
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
                          {active ? <Badge variant="secondary" className="bg-white/10 text-white">Current plan</Badge> : null}
                        </div>
                        <div className={`mt-2 text-sm leading-7 ${active ? "text-slate-200" : "text-slate-600"}`}>
                          {preset.summary}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="rounded-xl border bg-amber-50/80 p-3 text-xs leading-6 text-amber-900">
                  `imitate` is more suitable for copying and trial writing, `balanced` is suitable for most projects, and `transfer` is more suitable for binding the whole book and can actively avoid high fingerprint risks.
                                                  </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed p-4 text-sm leading-7 text-muted-foreground">
                After feature extraction is completed first, three retention strategies and corresponding reading instructions will appear here.
                                                </div>
            )}
          </section>
        </div>

        <section className="rounded-2xl border bg-white p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-slate-900">3. Preview the writing skeleton to be saved</div>
              <div className="mt-1 text-xs leading-6 text-muted-foreground">
                After saving, you will automatically enter the current writing method editor. You can continue to adjust the rules, bind it to the target, or directly use it for trial writing.
                                            </div>
            </div>
            <Button type="button" onClick={onCreate} disabled={!draft || createPending}>
              {createPending ? "Saving writing..." : "4. Save as writing assets"}
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
              There are no features available for preview yet. Complete feature extraction first, and then decide how to save it.
                                          </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
