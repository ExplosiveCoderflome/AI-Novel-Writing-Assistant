interface StatTileProps {
  label: string;
  value: number;
  hint: string;
}

function StatTile(props: StatTileProps) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="text-xs font-medium text-muted-foreground">{props.label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{props.value}</div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">{props.hint}</div>
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
    <div className="grid gap-3 md:grid-cols-4">
      <StatTile label="规则总数" value={props.total} hint="规则库中可查看和编辑的全部规则。" />
      <StatTile label="启用规则" value={props.enabled} hint="会参与全局或写法绑定解析的规则。" />
      <StatTile label="全局默认" value={props.global} hint="不绑定写法时也会进入正文生成。" />
      <StatTile label="自动改写" value={props.autoRewrite} hint="检测命中后可进入改写建议链路。" />
    </div>
  );
}
