import i18next from "i18next";
import { useTranslation } from "react-i18next";
import type { AntiAiEffectiveRulesResult, StyleProfile } from "@ai-novel/shared/types/styleEngine";
import { SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import EffectiveRuleList from "./EffectiveRuleList";

interface AntiAiEffectivePreviewCardProps {
  profiles: StyleProfile[];
  styleProfileId: string;
  effective?: AntiAiEffectiveRulesResult;
  loading: boolean;
  onStyleProfileChange: (styleProfileId: string) => void;
}

export default function AntiAiEffectivePreviewCard(props: AntiAiEffectivePreviewCardProps) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <SlidersHorizontal className="h-5 w-5" />{i18next.t("antiAiRules.antiAiEffectivePreviewCard.f7dmrx")}</CardTitle>
        <CardDescription>{i18next.t("antiAiRules.antiAiEffectivePreviewCard.duojr0")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select
          value={props.styleProfileId || "__global__"}
          onValueChange={(value) => props.onStyleProfileChange(value === "__global__" ? "" : value)}
        >
          <SelectTrigger>
            <SelectValue placeholder={i18next.t("antiAiRules.antiAiEffectivePreviewCard.epk6ou")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__global__">{i18next.t("antiAiRules.antiAiEffectivePreviewCard.7cnwxn")}</SelectItem>
            {props.profiles.map((profile) => (
              <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {props.loading ? (
          <div className="text-sm text-muted-foreground">{i18next.t("antiAiRules.antiAiEffectivePreviewCard.owddx1")}</div>
        ) : null}

        {props.effective ? (
          <div className="space-y-4">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-md border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">{i18next.t("antiAiRules.antiAiEffectivePreviewCard.ankxy5")}</div>
                <div className="mt-1 font-semibold">{props.effective.usesGlobalAntiAiBaseline ? "应用" : "未应用"}</div>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">{i18next.t("antiAiRules.antiAiEffectivePreviewCard.f7atge")}</div>
                <div className="mt-1 font-semibold">{props.effective.effectiveRules.length}</div>
              </div>
            </div>
            <EffectiveRuleList
              title={i18next.t("antiAiRules.antiAiEffectivePreviewCard.k26bg9")}
              rules={props.effective.globalBaselineRules}
              empty="没有全局默认规则。"
            />
            <EffectiveRuleList
              title={i18next.t("antiAiRules.antiAiEffectivePreviewCard.qooc2k")}
              rules={props.effective.styleSpecificRules}
              empty="预览上下文没有叠加写法专属规则。"
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
