import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
      <StatTile label={t("gen.pages.antiAiRules.components.AntiAiRuleStats.gen_17cea87d")} value={props.total} hint={t("gen.pages.antiAiRules.components.AntiAiRuleStats.gen_01aa8262")} />
      <StatTile label={t("gen.pages.antiAiRules.components.AntiAiRuleStats.gen_fd2ea09f")} value={props.enabled} hint={t("gen.pages.antiAiRules.components.AntiAiRuleStats.willParticipateRulesForGlobalOrStyleBindingParsing")} />
      <StatTile label={t("gen.pages.antiAiRules.components.AntiAiRuleStats.gen_1c65ec9e")} value={props.global} hint={t("gen.pages.antiAiRules.components.AntiAiRuleStats.enterTextGeneration")} />
      <StatTile label={t("gen.pages.antiAiRules.components.AntiAiRuleStats.gen_11519661")} value={props.autoRewrite} hint={t("gen.pages.antiAiRules.components.AntiAiRuleStats.gen_c82a210c")} />
    </div>
  );
}
