interface StatTileProps {
  label: string;
  value: number;
}

function StatTile(props: StatTileProps) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="text-sm text-muted-foreground">{props.label}</dt>
      <dd className="text-xl font-semibold tabular-nums text-foreground">{props.value}</dd>
    </div>
  );
}

interface AntiAiRuleStatsProps {
  total: number;
  enabled: number;
  global: number;
  autoRewrite: number;
}

export default function AntiAiRuleStats(props: AntiAiRuleStatsProps) {
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-3 border-b border-border/60 pb-5 sm:gap-x-12">
      <StatTile label="全部规则" value={props.total} />
      <StatTile label="已启用" value={props.enabled} />
      <StatTile label="全局默认" value={props.global} />
      <StatTile label="可自动改写" value={props.autoRewrite} />
    </dl>
  );
}
