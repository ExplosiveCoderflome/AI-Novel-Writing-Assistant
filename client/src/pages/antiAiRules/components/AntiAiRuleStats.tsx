import { useTranslation } from "react-i18next";
import i18next from "i18next";
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
  const { t } = useTranslation();
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <StatTile label={i18next.t("dict.gen_17cea87d")} value={props.total} hint={i18next.t("dict.gen_01aa8262")} />
      <StatTile label={i18next.t("dict.gen_fd2ea09f")} value={props.enabled} hint={i18next.t("dict.willParticipateRulesForGlobalOrStyleBindingParsing")} />
      <StatTile label={i18next.t("dict.gen_1c65ec9e")} value={props.global} hint={i18next.t("dict.enterTextGeneration")} />
      <StatTile label={i18next.t("dict.gen_11519661")} value={props.autoRewrite} hint={i18next.t("dict.gen_c82a210c")} />
    </div>
  );
}
