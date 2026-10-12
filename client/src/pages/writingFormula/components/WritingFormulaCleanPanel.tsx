import { isStyleIssueRewritable, type StyleDetectionReport, type StyleProfile, type StyleRewriteGuard } from "@ai-novel/shared/types/styleEngine";
import { StyleRiskReport, StyleRewriteProtection } from "@/components/styleReview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WritingFormulaCleanPanelProps {
  selectedProfile: StyleProfile | null;
  detectInput: string;
  detectionReport: StyleDetectionReport | null;
  detectionPending: boolean;
  rewritePending: boolean;
  rewritePreview: string;
  rewriteGuard?: StyleRewriteGuard;
  onDetectInputChange: (value: string) => void;
  onDetect: () => void;
  onRewrite: () => void;
}

export default function WritingFormulaCleanPanel(props: WritingFormulaCleanPanelProps) {
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
    <Card className="border-0 shadow-none">
      <CardHeader>
        <CardTitle>去 AI 味</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {selectedProfile ? (
          <div className="rounded-2xl bg-muted/30 px-4 py-3 text-sm leading-7 text-muted-foreground">
            当前按「{selectedProfile.name}」这套写法来做检测和修正。这里只处理正文的 AI 味，不会改写法字段本身。
          </div>
        ) : (
          <div className="rounded-2xl bg-muted/30 px-4 py-3 text-sm leading-7 text-muted-foreground">
            先从列表里选中一套写法，再来检测正文。
          </div>
        )}

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <div className="text-base font-semibold text-slate-950">当前会优先参考的反 AI 约束</div>
            <div className="text-sm leading-6 text-slate-500">
              如果这套写法绑了反 AI 规则，检测和修正会优先按这些约束去判断问题。
            </div>
          </div>
          {antiAiRuleNames.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {antiAiRuleNames.map((ruleName) => (
                <div key={`${selectedProfile?.id}-${ruleName}`} className="rounded-full bg-muted/30 px-3 py-1 text-sm text-muted-foreground">
                  {ruleName}
                </div>
              ))}
            </div>
          ) : (
            <div className="py-3 text-sm leading-6 text-muted-foreground">
              这套写法还没有绑定明确的反 AI 规则。当前检测会更依赖通用风险判断，结果可能不够贴合你的预期。
            </div>
          )}
        </div>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <div className="text-base font-semibold text-slate-950">检测正文</div>
            <div className="text-sm leading-6 text-slate-500">
              粘贴你想检查的正文。建议一次给一段完整场景，这样更容易看出叙述腔、对白腔和解释腔的问题。
            </div>
          </div>

          <textarea
            data-writing-formula-detect-input
            autoFocus
            className="min-h-[220px] w-full rounded-md border p-3 text-sm"
            placeholder="粘贴待检测正文"
            value={detectInput}
            onChange={(event) => onDetectInputChange(event.target.value)}
          />

          <div className="flex flex-wrap gap-2">
            <Button onClick={onDetect} disabled={detectionPending || rewritePending || !selectedProfile || !detectInput.trim()}>
              执行检测
            </Button>
            <Button variant="secondary" onClick={onRewrite} disabled={rewritePending || detectionPending || !selectedProfile || !detectInput.trim() || Boolean(detectionReport && !detectionReport.violations.some(issue => isStyleIssueRewritable(issue)))}>
              生成局部修订预览
            </Button>
          </div>

          {detectionReport ? (
            <StyleRiskReport report={detectionReport} />
          ) : (
            <div className="py-3 text-sm leading-6 text-muted-foreground">
              查看句段中的表达问题、原文依据和修改方向。
            </div>
          )}

          {rewritePreview ? (
            <div className="space-y-2">
              <StyleRewriteProtection guard={props.rewriteGuard} retainedOriginal={rewritePreview === detectInput} />
              <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-xl bg-muted/20 p-4 text-sm">
                {rewritePreview}
              </pre>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
