import { useTranslation } from "react-i18next";
import i18next from "i18next";
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
  const { t } = useTranslation();
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
        <CardTitle>{i18next.t("dict.gen_4f2fa708")}</CardTitle>
        <div className="text-sm leading-7 text-muted-foreground">{i18next.t("writingFormula.writingFormulaImitateFlow.64c453")}</div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
          <section className="space-y-3 rounded-2xl border bg-slate-50/70 p-4">
            <div className="text-sm font-medium text-slate-900">{i18next.t("dict.inputReferenceText")}</div>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                className="rounded-md border bg-white p-2 text-sm"
                placeholder={i18next.t("dict.gen_c35402c0")}
                value={form.name}
                onChange={(event) => onFormChange({ name: event.target.value })}
              />
              <input
                className="rounded-md border bg-white p-2 text-sm"
                placeholder={i18next.t("dict.gen_1befc273")}
                value={form.category}
                onChange={(event) => onFormChange({ category: event.target.value })}
              />
            </div>
            <textarea
              className="min-h-[280px] w-full rounded-xl border bg-white p-3 text-sm leading-7"
              placeholder={i18next.t("dict.gen_87a205f3")}
              value={form.sourceText}
              onChange={(event) => onFormChange({ sourceText: event.target.value })}
            />
            <div className="flex justify-end">
              <Button type="button" onClick={onExtract} disabled={!form.name.trim() || !form.sourceText.trim() || extractPending}>
                {extractPending ? i18next.t("dict.gen_3e78a2a7") : i18next.t("dict.extractFeaturesFirst")}
              </Button>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border bg-white p-4">
            <div className="text-sm font-medium text-slate-900">{i18next.t("dict.selectRetentionDegree")}</div>
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
                          {active ? <Badge variant="secondary" className="bg-white/10 text-white">{i18next.t("dict.gen_ce717abb")}</Badge> : null}
                        </div>
                        <div className={`mt-2 text-sm leading-7 ${active ? "text-slate-200" : "text-slate-600"}`}>
                          {preset.summary}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="rounded-xl border bg-amber-50/80 p-3 text-xs leading-6 text-amber-900">
                  `imitatei18next.t("writingFormula.writingFormulaImitateFlow.x96i0n")balancedi18next.t("writingFormula.writingFormulaImitateFlow.7cmxq8")transfer` 更适合整书绑定，能主动避开高指纹风险。
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed p-4 text-sm leading-7 text-muted-foreground">{i18next.t("writingFormula.writingFormulaImitateFlow.adcpxs")}</div>
            )}
          </section>
        </div>

        <section className="rounded-2xl border bg-white p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-slate-900">{i18next.t("dict.previewWritingSkeleton")}</div>
              <div className="mt-1 text-xs leading-6 text-muted-foreground">{i18next.t("writingFormula.writingFormulaImitateFlow.xdacyd")}</div>
            </div>
            <Button type="button" onClick={onCreate} disabled={!draft || createPending}>
              {createPending ? i18next.t("dict.gen_9ed210f2") : i18next.t("dict.saveAsWritingAsset")}
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
            <div className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{i18next.t("writingFormula.writingFormulaImitateFlow.6ktngo")}</div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
