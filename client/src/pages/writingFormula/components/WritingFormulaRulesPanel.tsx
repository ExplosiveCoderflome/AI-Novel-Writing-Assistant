import { useMemo } from "react";
import type { AntiAiRule } from "@ai-novel/shared/types/styleEngine";
import { ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WritingFormulaRulesPanelProps {
  antiAiRules: AntiAiRule[];
  onToggleRule: (rule: AntiAiRule, enabled: boolean) => void;
}

export default function WritingFormulaRulesPanel(props: WritingFormulaRulesPanelProps) {
  const { antiAiRules } = props;

  const enabledCount = useMemo(
    () => antiAiRules.filter((rule) => rule.enabled).length,
    [antiAiRules],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Anti-AI rules
                          </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border bg-muted/20 p-3 text-sm">
          enable {enabledCount} / {antiAiRules.length} rules
                          </div>
        <div className="text-sm leading-6 text-muted-foreground">
          View, create and adjust anti-AI rules in the Rule Center; the writing editing area continues to be responsible for selecting which rules are bound to the current writing.
                          </div>
        <Button className="w-full" variant="secondary" asChild>
          <Link to="/anti-ai-rules">Enter the rule center</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
