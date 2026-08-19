import { useTranslation } from "react-i18next";
import i18next from "i18next";
import type { StyleDetectionReport, StyleProfile } from "@ai-novel/shared/types/styleEngine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WritingFormulaDiffRow } from "../writingFormulaV2.shared";
import SelectControl from "@/components/common/SelectControl";

interface WritingFormulaCleanFlowProps {
  profiles: StyleProfile[];
  selectedProfileId: string;
  detectInput: string;
  detectionReport: StyleDetectionReport | null;
  diffRows: WritingFormulaDiffRow[];
  rewritePreview: string;
  suggestionDrafts: string[];
  detectionPending: boolean;
  rewritePending: boolean;
  onProfileChange: (profileId: string) => void;
  onInputChange: (value: string) => void;
  onDetect: () => void;
  onRewrite: () => void;
  onOpenAdvanced: () => void;
}

export default function WritingFormulaCleanFlow(props: WritingFormulaCleanFlowProps) {
  const { t } = useTranslation();
  const {
    profiles,
    selectedProfileId,
    detectInput,
    detectionReport,
    diffRows,
    rewritePreview,
    suggestionDrafts,
    detectionPending,
    rewritePending,
    onProfileChange,
    onInputChange,
    onDetect,
    onRewrite,
    onOpenAdvanced,
  } = props;

  return (
    <Card className="border-slate-200/80 bg-white/90 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
      <CardHeader>
        <CardTitle>{i18next.t("dict.gen_d7a40c43")}</CardTitle>
        <div className="text-sm leading-7 text-muted-foreground">{i18next.t("writingFormula.writingFormulaCleanFlow.vxeyfu")}</div>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)]">
          <div className="space-y-3 rounded-2xl border bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-slate-900">{i18next.t("dict.gen_6042481d")}</div>
              <SelectControl
                className="rounded-md border bg-white px-3 py-2 text-sm"
                value={selectedProfileId}
                onChange={(event) => onProfileChange(event.target.value)}
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.name}</option>
                ))}
              </SelectControl>
            </div>
            <textarea
              className="min-h-[280px] w-full rounded-xl border bg-white p-3 text-sm leading-7"
              placeholder={i18next.t("dict.gen_6151c64c")}
              value={detectInput}
              onChange={(event) => onInputChange(event.target.value)}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={onDetect} disabled={!selectedProfileId || !detectInput.trim() || detectionPending}>
                {detectionPending ? i18next.t("dict.gen_f89e8569") : i18next.t("dict.gen_47648ba4")}
              </Button>
              <Button type="button" onClick={onRewrite} disabled={!selectedProfileId || !detectInput.trim() || rewritePending}>
                {rewritePending ? i18next.t("dict.gen_c32c2ac7") : i18next.t("dict.generateRevision")}
              </Button>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border bg-white p-4">
            <div className="text-sm font-medium text-slate-900">{i18next.t("dict.gen_a8064f51")}</div>
            {detectionReport ? (
              <>
                <div className="rounded-2xl border bg-slate-950 p-4 text-white">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-300">{i18next.t("dict.gen_9c724608")}</div>
                  <div className="mt-2 text-3xl font-semibold">{detectionReport.riskScore}</div>
                  <div className="mt-2 text-sm leading-7 text-slate-200">{detectionReport.summary}</div>
                </div>
                <div className="space-y-2">
                  {detectionReport.violations.map((violation, index) => (
                    <div key={`${violation.ruleId}-${index}`} className="rounded-xl border bg-slate-50/70 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-slate-900">{violation.ruleName}</div>
                        <Badge variant="outline">{violation.severity}</Badge>
                      </div>
                      <div className="mt-2 text-xs leading-6 text-slate-600">{violation.reason}</div>
                      <div className="mt-2 whitespace-pre-wrap rounded-lg border bg-white px-3 py-2 text-xs leading-6 text-slate-800">
                        {violation.excerpt}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed p-4 text-sm leading-7 text-muted-foreground">{i18next.t("writingFormula.writingFormulaCleanFlow.mv7br2")}</div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-4">
          <div className="text-sm font-medium text-slate-900">{i18next.t("dict.gen_2b82c3a2")}</div>
          <div className="mt-1 text-xs leading-6 text-muted-foreground">{i18next.t("writingFormula.writingFormulaCleanFlow.oq5hdl")}</div>
          {rewritePreview ? (
            <div className="mt-4 grid gap-3">
              {diffRows.map((row, index) => (
                <div key={row.id} className={`grid gap-3 rounded-2xl border p-3 xl:grid-cols-2 ${row.changed ? "border-sky-200 bg-sky-50/40" : "bg-slate-50/40"}`}>
                  <div className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{i18next.t("dict.gen_89c11482")}</div>
                    <div className="min-h-[72px] rounded-xl border bg-white px-3 py-2 text-sm leading-7 text-slate-700">
                      {row.before || " "}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{i18next.t("dict.gen_a35541d6")}</div>
                    <div className="min-h-[72px] rounded-xl border bg-white px-3 py-2 text-sm leading-7 text-slate-900">
                      {row.after || " "}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{i18next.t("writingFormula.writingFormulaCleanFlow.ipt091")}</div>
          )}
        </section>

        <section className="rounded-2xl border bg-slate-50/60 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-slate-900">{i18next.t("dict.gen_54ec2834")}</div>
                <div className="mt-1 text-xs leading-6 text-muted-foreground">{i18next.t("writingFormula.writingFormulaCleanFlow.hb2dv0")}</div>
              </div>
              <Button type="button" variant="outline" onClick={onOpenAdvanced}>{i18next.t("writingFormula.writingFormulaCleanFlow.bi2sdz")}</Button>
            </div>
          {suggestionDrafts.length > 0 ? (
            <div className="mt-4 grid gap-2">
              {suggestionDrafts.map((item) => (
                <div key={item} className="rounded-xl border bg-white px-3 py-3 text-sm leading-7 text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{i18next.t("writingFormula.writingFormulaCleanFlow.tauu5u")}</div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
