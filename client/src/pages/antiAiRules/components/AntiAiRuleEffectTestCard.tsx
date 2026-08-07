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
          Effect test
                          </CardTitle>
        <CardDescription>
          Paste in a piece of text, check how the rules detect AI flavor, and generate a preview-only revision.
                          </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="text-xs text-muted-foreground">test rules</div>
            <div className="mt-1 font-semibold">{totalRuleCount}</div>
          </div>
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="text-xs text-muted-foreground">Join temporarily</div>
            <div className="mt-1 font-semibold">{props.previewRules.length}</div>
          </div>
        </div>

        {props.previewRules.length > 0 ? (
          <div className="space-y-2 rounded-md border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-foreground">Temporary test rules</div>
              <Button type="button" variant="ghost" size="sm" onClick={props.onClearPreviewRules}>
                Clear
                                            </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {props.previewRules.map((rule) => (
                <button
                  key={rule.id}
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1 text-xs text-foreground"
                  onClick={() => props.onRemovePreviewRule(rule.id)}
                  title="Move out of test"
                >
                  {rule.name}
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-3 text-sm leading-6 text-muted-foreground">
            Add tests from the rule list on the left to compare effects without changing the rule status.
                                    </div>
        )}

        <textarea
          className="min-h-[180px] w-full rounded-md border bg-background p-3 text-sm leading-7"
          value={props.content}
          placeholder="Paste the text to be detected. It is recommended to enter a complete scene to facilitate the judgment of summary, explanation and template sense."
          onChange={(event) => props.onContentChange(event.target.value)}
        />

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={props.onDetect} disabled={props.detectionPending || !props.content.trim()}>
            {props.detectionPending ? "Detecting..." : "Performing detection"}
          </Button>
          <Button type="button" variant="secondary" onClick={props.onRewrite} disabled={props.rewritePending || !props.content.trim()}>
            {props.rewritePending ? "Under Repair..." : "One-Click Repair"}
          </Button>
        </div>

        {props.report ? (
          <div className="space-y-3 rounded-md border p-4">
            <div className="space-y-1">
              <div className="font-medium text-foreground">Risk score:{props.report.riskScore}</div>
              <div className="text-sm leading-6 text-muted-foreground">{props.report.summary}</div>
              <div className="text-xs text-muted-foreground">Hit rules:{props.report.appliedRuleIds.length}</div>
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
                    <div className="mt-2 text-xs leading-5 text-muted-foreground">suggestion:{item.suggestion}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                No issues were found that warranted a correction process.
                                                </div>
            )}
          </div>
        ) : null}

        {props.rewritePreview ? (
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">Revised manuscript preview</div>
            <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/20 p-4 text-sm leading-7">
              {props.rewritePreview}
            </pre>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
