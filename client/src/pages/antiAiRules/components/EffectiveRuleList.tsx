import { useTranslation } from "react-i18next";
import i18next from "i18next";
import type { AntiAiEffectiveRuleItem } from "@ai-novel/shared/types/styleEngine";
import { Badge } from "@/components/ui/badge";
import { severityLabels, typeLabels } from "../antiAiRulesPage.shared";

interface EffectiveRuleListProps {
  title: string;
  rules: AntiAiEffectiveRuleItem[];
  empty: string;
}

export default function EffectiveRuleList(props: EffectiveRuleListProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-foreground">{props.title}</div>
      {props.rules.length > 0 ? (
        <div className="space-y-2">
          {props.rules.map((item) => (
            <div key={`${item.source}-${item.rule.id}`} className="rounded-md border bg-background p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium text-foreground">{item.rule.name}</div>
                <Badge variant={item.source === "global_baseline" ? "default" : "secondary"}>
                  {item.source === "global_baseline" ? i18next.t("dict.gen_1c65ec9e") : i18next.t("dict.gen_ad46ae97")}
                </Badge>
                <Badge variant="outline">{typeLabels[item.rule.type]} / {severityLabels[item.rule.severity]}</Badge>
              </div>
              <div className="mt-2 text-xs leading-5 text-muted-foreground">
                {item.sourceLabel}{item.weight !== 1 ? i18next.t("antiAiRules.effectiveRuleList.35pilk", { val1: item.weight }) : ""}
              </div>
              {item.rule.promptInstruction ? (
                <div className="mt-2 text-sm leading-6 text-muted-foreground">{item.rule.promptInstruction}</div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{props.empty}</div>
      )}
    </div>
  );
}
