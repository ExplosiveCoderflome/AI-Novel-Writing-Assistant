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
          反 AI 规则
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border bg-muted/20 p-3 text-sm">
          启用 {enabledCount} / {antiAiRules.length} 条规则
        </div>
        <div className="text-sm leading-6 text-muted-foreground">
          在规则中心查看、创建和调整反 AI 规则；写法编辑区继续负责选择哪些规则绑定到当前写法。
        </div>
        <Button className="w-full" variant="secondary" asChild>
          <Link to="/anti-ai-rules">进入规则中心</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
