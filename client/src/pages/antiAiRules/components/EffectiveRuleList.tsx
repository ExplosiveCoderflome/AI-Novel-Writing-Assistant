import type { AntiAiEffectiveRuleItem } from "@ai-novel/shared/types/styleEngine";
import { Badge } from "@/components/ui/badge";
import { severityLabels, typeLabels } from "../antiAiRulesPage.shared";

interface EffectiveRuleListProps {
  title: string;
  rules: AntiAiEffectiveRuleItem[];
  empty: string;
}

export default function EffectiveRuleList(props: EffectiveRuleListProps) {
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
                  {item.source === "global_baseline" ? "全局默认" : "写法规则"}
                </Badge>
                <Badge variant="outline">{typeLabels[item.rule.type]} / {severityLabels[item.rule.severity]}</Badge>
              </div>
              <div className="mt-2 text-xs leading-5 text-muted-foreground">
                {item.sourceLabel}{item.weight !== 1 ? `，强度 ${item.weight}` : ""}
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
