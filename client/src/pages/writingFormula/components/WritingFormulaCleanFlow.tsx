import type { StyleDetectionReport, StyleProfile } from "@ai-novel/shared/types/styleEngine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WritingFormulaDiffRow } from "../writingFormulaV2.shared";

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
        <CardTitle>给这段稿子去 AI 味</CardTitle>
        <div className="text-sm leading-7 text-muted-foreground">
          检测先帮你指出哪一段写得像模板话，再给一版可以直接比较的修订稿。重复出现的问题，我会顺手整理成规则建议，方便你带回当前写法编辑继续处理。
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)]">
          <div className="space-y-3 rounded-2xl border bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-slate-900">原稿输入</div>
              <select
                className="rounded-md border bg-white px-3 py-2 text-sm"
                value={selectedProfileId}
                onChange={(event) => onProfileChange(event.target.value)}
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.name}</option>
                ))}
              </select>
            </div>
            <textarea
              className="min-h-[280px] w-full rounded-xl border bg-white p-3 text-sm leading-7"
              placeholder="粘贴你想先去 AI 味的一段正文。"
              value={detectInput}
              onChange={(event) => onInputChange(event.target.value)}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={onDetect} disabled={!selectedProfileId || !detectInput.trim() || detectionPending}>
                {detectionPending ? "正在检测..." : "先做检测"}
              </Button>
              <Button type="button" onClick={onRewrite} disabled={!selectedProfileId || !detectInput.trim() || rewritePending}>
                {rewritePending ? "正在生成修订稿..." : "一键生成修订稿"}
              </Button>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border bg-white p-4">
            <div className="text-sm font-medium text-slate-900">问题卡与风险分</div>
            {detectionReport ? (
              <>
                <div className="rounded-2xl border bg-slate-950 p-4 text-white">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-300">风险分</div>
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
              <div className="rounded-xl border border-dashed p-4 text-sm leading-7 text-muted-foreground">
                先跑一次检测，这里会告诉你哪些段落最像 AI 在说话，以及它们为什么让读者出戏。
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-4">
          <div className="text-sm font-medium text-slate-900">修订前后 diff</div>
          <div className="mt-1 text-xs leading-6 text-muted-foreground">
            这里按段落行做轻量对比，方便你快速判断这次修正是在压模板感，还是把原有语气也一起削掉了。
          </div>
          {rewritePreview ? (
            <div className="mt-4 grid gap-3">
              {diffRows.map((row, index) => (
                <div key={row.id} className={`grid gap-3 rounded-2xl border p-3 xl:grid-cols-2 ${row.changed ? "border-sky-200 bg-sky-50/40" : "bg-slate-50/40"}`}>
                  <div className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">原稿 {index + 1}</div>
                    <div className="min-h-[72px] rounded-xl border bg-white px-3 py-2 text-sm leading-7 text-slate-700">
                      {row.before || " "}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">修订稿 {index + 1}</div>
                    <div className="min-h-[72px] rounded-xl border bg-white px-3 py-2 text-sm leading-7 text-slate-900">
                      {row.after || " "}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              一键修订后，这里会直接出现前后对照。
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-slate-50/60 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-slate-900">可沉淀成规则的重复问题</div>
                <div className="mt-1 text-xs leading-6 text-muted-foreground">
                  这一版不会强行替你落库，但会先把重复问题整理成建议，方便你带回当前写法编辑决定是否固化。
                </div>
              </div>
              <Button type="button" variant="outline" onClick={onOpenAdvanced}>
                查看当前写法编辑
              </Button>
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
            <div className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              检测出问题后，这里才会出现可沉淀的规则建议。
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
