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
      <StatTile label="Total number of rules" value={props.total} hint="All rules in the rule base can be viewed and edited." />
      <StatTile label="Enable rules" value={props.enabled} hint="Rules that will participate in global or written binding parsing." />
      <StatTile label="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." value={props.global} hint="Text generation will also occur when the writing method is not bound." />
      <StatTile label="Automatically rewrite" value={props.autoRewrite} hint="After detecting a hit, you can enter the rewriting suggestion link." />
    </div>
  );
}
