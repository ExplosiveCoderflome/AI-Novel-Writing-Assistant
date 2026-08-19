import { useTranslation } from "react-i18next";
import i18next from "i18next";
import type { StyleDetectionReport, StyleProfile } from "@ai-novel/shared/types/styleEngine";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WritingFormulaCleanPanelProps {
  selectedProfile: StyleProfile | null;
  detectInput: string;
  detectionReport: StyleDetectionReport | null;
  detectionPending: boolean;
  rewritePending: boolean;
  rewritePreview: string;
  onDetectInputChange: (value: string) => void;
  onDetect: () => void;
  onRewrite: () => void;
}

export default function WritingFormulaCleanPanel(props: WritingFormulaCleanPanelProps) {
  const { t } = useTranslation();
  const {
    selectedProfile,
    detectInput,
    detectionReport,
    detectionPending,
    rewritePending,
    rewritePreview,
    onDetectInputChange,
    onDetect,
    onRewrite,
  } = props;

  const antiAiRuleNames = selectedProfile?.antiAiRules.map((rule) => rule.name) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{i18next.t("dict.gen_b589a6aa")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {selectedProfile ? (
          <div className="rounded-2xl border bg-slate-50/70 px-4 py-3 text-sm leading-7 text-slate-700">
            当前按「{selectedProfile.name}」这套写法来做检测和修正。这里只处理正文的 AI 味，不会改写法字段本身。
          </div>
        ) : (
          <div className="rounded-2xl border bg-slate-50/70 px-4 py-3 text-sm leading-7 text-slate-700">{i18next.t("writingFormula.writingFormulaCleanPanel.aq9pj9")}</div>
        )}

        <div className="space-y-4 rounded-2xl border p-4">
          <div className="space-y-1">
            <div className="text-base font-semibold text-slate-950">{i18next.t("dict.gen_76986240")}</div>
            <div className="text-sm leading-6 text-slate-500">{i18next.t("writingFormula.writingFormulaCleanPanel.nxoay1")}</div>
          </div>
          {antiAiRuleNames.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {antiAiRuleNames.map((ruleName) => (
                <div key={`${selectedProfile?.id}-${ruleName}`} className="rounded-full border bg-slate-50 px-3 py-1 text-sm text-slate-700">
                  {ruleName}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed px-3 py-3 text-sm leading-6 text-slate-500">{i18next.t("writingFormula.writingFormulaCleanPanel.rn9y1t")}</div>
          )}
        </div>

        <div className="space-y-4 rounded-2xl border p-4">
          <div className="space-y-1">
            <div className="text-base font-semibold text-slate-950">{i18next.t("dict.gen_c59ebd75")}</div>
            <div className="text-sm leading-6 text-slate-500">{i18next.t("writingFormula.writingFormulaCleanPanel.t0darq")}</div>
          </div>

          <textarea
            data-writing-formula-detect-input
            autoFocus
            className="min-h-[220px] w-full rounded-md border p-3 text-sm"
            placeholder={i18next.t("dict.gen_2273a526")}
            value={detectInput}
            onChange={(event) => onDetectInputChange(event.target.value)}
          />

          <div className="flex flex-wrap gap-2">
            <Button onClick={onDetect} disabled={detectionPending || !selectedProfile || !detectInput.trim()}>{i18next.t("writingFormula.writingFormulaCleanPanel.cza6fk")}</Button>
            <Button variant="secondary" onClick={onRewrite} disabled={rewritePending || !selectedProfile || !detectInput.trim()}>{i18next.t("writingFormula.writingFormulaCleanPanel.agev37")}</Button>
          </div>

          {detectionReport ? (
            <div className="space-y-3 rounded-2xl border p-4 text-sm">
              <div className="space-y-1">
                <div className="font-medium text-slate-900">{i18next.t("dict.gen_5feae2d7")}</div>
                <div className="leading-6 text-slate-600">{detectionReport.summary}</div>
              </div>
              <div className="space-y-2">
                {detectionReport.violations.map((item, index) => (
                  <div key={`${item.ruleId}-${index}`} className="rounded-xl border p-3">
                    <div className="font-medium text-slate-900">{item.ruleName}</div>
                    <div className="mt-1 text-xs leading-6 text-slate-500">{item.reason}</div>
                    <div className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                      {item.excerpt}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed px-3 py-3 text-sm leading-6 text-slate-500">{i18next.t("writingFormula.writingFormulaCleanPanel.6a4gb7")}</div>
          )}

          {rewritePreview ? (
            <div className="space-y-2">
              <div className="text-sm font-medium text-slate-900">{i18next.t("dict.gen_1bc513b8")}</div>
              <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-xl border bg-muted/20 p-4 text-sm">
                {rewritePreview}
              </pre>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
