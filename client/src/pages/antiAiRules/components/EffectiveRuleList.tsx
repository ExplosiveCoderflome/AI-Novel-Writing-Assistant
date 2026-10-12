import type { AntiAiEffectiveRuleItem } from "@ai-novel/shared/types/styleEngine";

interface EffectiveRuleListProps {
  title: string;
  rules: AntiAiEffectiveRuleItem[];
  empty: string;
}

export default function EffectiveRuleList(props: EffectiveRuleListProps) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium text-muted-foreground">{props.title} · {props.rules.length}</h3>
      {props.rules.length > 0 ? (
        <ul className="space-y-2">
          {props.rules.map((item) => (
            <li key={item.source + "-" + item.rule.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
              <span className="min-w-0 break-words">{item.rule.name}</span>
              {item.source !== "global_baseline" || item.weight !== 1 ? (
                <span className="text-xs text-muted-foreground">{item.sourceLabel}{item.weight !== 1 ? " · 强度 " + item.weight : ""}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : <p className="text-xs leading-5 text-muted-foreground">{props.empty}</p>}
    </div>
  );
}
