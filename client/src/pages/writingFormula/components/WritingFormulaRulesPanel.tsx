import { useTranslation } from "react-i18next";
import i18next from "i18next";
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
  const { t } = useTranslation();
  const { antiAiRules } = props;

  const enabledCount = useMemo(
    () => antiAiRules.filter((rule) => rule.enabled).length,
    [antiAiRules],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />{i18next.t("sidebar.antiAiRules")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border bg-muted/20 p-3 text-sm">
          启用 {enabledCount} / {antiAiRules.length} 条规则
        </div>
        <div className="text-sm leading-6 text-muted-foreground">{i18next.t("writingFormula.writingFormulaRulesPanel.27k329")}</div>
        <Button className="w-full" variant="secondary" asChild>
          <Link to="/anti-ai-rules">{i18next.t("dict.gen_e54140ea")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
