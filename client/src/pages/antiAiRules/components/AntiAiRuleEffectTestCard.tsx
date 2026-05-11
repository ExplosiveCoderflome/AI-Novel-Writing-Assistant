import type { AntiAiRule, StyleDetectionReport } from "@ai-novel/shared/types/styleEngine";
import { FlaskConical, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { severityLabels, typeLabels } from "../antiAiRulesPage.shared";

interface AntiAiRuleEffectTestCardProps {
  content: string;
  report: StyleDetectionReport | null;
  rewritePreview: string;
  detectionPending: boolean;
  rewritePending: boolean;
  effectiveRuleCount: number;
  previewRules: AntiAiRule[];
  onContentChange: (content: string) => void;
  onDetect: () => void;
  onRewrite: () => void;
  onRemovePreviewRule: (ruleId: string) => void;
  onClearPreviewRules: () => void;
}

export default function AntiAiRuleEffectTestCard(props: AntiAiRuleEffectTestCardProps) {
  const totalRuleCount = props.effectiveRuleCount + props.previewRules.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <FlaskConical className="h-5 w-5" />
          效果测试
        </CardTitle>
        <CardDescription>
          粘贴一段正文，检查规则会怎样判断 AI 味，并生成一版只用于预览的修订稿。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="text-xs text-muted-foreground">测试规则</div>
            <div className="mt-1 font-semibold">{totalRuleCount}</div>
          </div>
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="text-xs text-muted-foreground">临时加入</div>
            <div className="mt-1 font-semibold">{props.previewRules.length}</div>
          </div>
        </div>

        {props.previewRules.length > 0 ? (
          <div className="space-y-2 rounded-md border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-foreground">临时测试规则</div>
              <Button type="button" variant="ghost" size="sm" onClick={props.onClearPreviewRules}>
                清空
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {props.previewRules.map((rule) => (
                <button
                  key={rule.id}
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1 text-xs text-foreground"
                  onClick={() => props.onRemovePreviewRule(rule.id)}
                  title="移出测试"
                >
                  {rule.name}
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-3 text-sm leading-6 text-muted-foreground">
            从左侧规则列表加入测试，可以在不改变规则状态的情况下比较效果。
          </div>
        )}

        <textarea
          className="min-h-[180px] w-full rounded-md border bg-background p-3 text-sm leading-7"
          value={props.content}
          placeholder="粘贴待检测正文。建议输入一段完整场景，便于判断总结腔、解释腔和模板感。"
          onChange={(event) => props.onContentChange(event.target.value)}
        />

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={props.onDetect} disabled={props.detectionPending || !props.content.trim()}>
            {props.detectionPending ? "检测中..." : "执行检测"}
          </Button>
          <Button type="button" variant="secondary" onClick={props.onRewrite} disabled={props.rewritePending || !props.content.trim()}>
            {props.rewritePending ? "修正中..." : "一键修正"}
          </Button>
        </div>

        {props.report ? (
          <div className="space-y-3 rounded-md border p-4">
            <div className="space-y-1">
              <div className="font-medium text-foreground">风险分：{props.report.riskScore}</div>
              <div className="text-sm leading-6 text-muted-foreground">{props.report.summary}</div>
              <div className="text-xs text-muted-foreground">命中规则：{props.report.appliedRuleIds.length}</div>
            </div>
            {props.report.violations.length > 0 ? (
              <div className="space-y-2">
                {props.report.violations.map((item, index) => (
                  <div key={`${item.ruleId}-${index}`} className="rounded-md border bg-muted/20 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-foreground">{item.ruleName}</div>
                      <Badge variant="outline">{typeLabels[item.ruleType as keyof typeof typeLabels] ?? item.ruleType}</Badge>
                      <Badge variant="outline">{severityLabels[item.severity]}</Badge>
                    </div>
                    <div className="mt-2 text-xs leading-5 text-muted-foreground">{item.reason}</div>
                    <div className="mt-2 whitespace-pre-wrap rounded-md border bg-background px-3 py-2 text-xs leading-5 text-foreground">
                      {item.excerpt}
                    </div>
                    <div className="mt-2 text-xs leading-5 text-muted-foreground">建议：{item.suggestion}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                没有发现值得进入修正流程的问题。
              </div>
            )}
          </div>
        ) : null}

        {props.rewritePreview ? (
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">修订稿预览</div>
            <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/20 p-4 text-sm leading-7">
              {props.rewritePreview}
            </pre>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
