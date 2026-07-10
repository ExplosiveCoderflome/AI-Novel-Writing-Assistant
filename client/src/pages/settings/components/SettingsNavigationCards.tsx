import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getRagSettings } from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

export default function SettingsNavigationCards(props: {
  mode?: "all" | "routes" | "knowledge";
}) {
  const { mode = "all" } = props;
  const ragSettingsQuery = useQuery({
    queryKey: queryKeys.settings.rag,
    queryFn: getRagSettings,
  });
  const ragSettings = ragSettingsQuery.data?.data;
  const ragProvider = useMemo(
    () => ragSettings?.providers.find((item) => item.provider === ragSettings.embeddingProvider),
    [ragSettings],
  );

  return (
    <>
      {mode === "all" || mode === "knowledge" ? (
        <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle>{t("gen.pages.settings.components.SettingsNavigationCards.gen_d68b96a8")}</CardTitle>
          <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>
            不配置也可以开始创作；启用后，长篇设定、资料和上下文召回会更稳。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid min-w-0 gap-3 md:grid-cols-2">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">{t("gen.pages.settings.components.SettingsNavigationCards.gen_1056425f")}</div>
              <div className={`mt-1 font-medium ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{ragProvider?.name ?? ragSettings?.embeddingProvider ?? "-"}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">{t("gen.pages.settings.components.SettingsNavigationCards.gen_e19716c1")}</div>
              <div className={`mt-1 font-medium ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{ragSettings?.embeddingModel ?? "-"}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{t("gen.pages.settings.components.SettingsNavigationCards.gen_79126156")}</span>
            <Badge variant={ragProvider?.isConfigured ? "default" : "outline"}>
              {ragProvider?.isConfigured ? t("gen.pages.settings.components.SettingsNavigationCards.apiKeyAvailable") : t("gen.pages.settings.components.SettingsNavigationCards.gen_2a94549c")}
            </Badge>
            <Badge variant={ragProvider?.isActive ? "default" : "outline"}>
              {ragProvider?.isActive ? t("gen.pages.settings.components.SettingsNavigationCards.gen_c16e2ef8") : t("gen.pages.settings.components.SettingsNavigationCards.gen_4637765b")}
            </Badge>
          </div>
          <Button asChild className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction}>
            <Link to="/knowledge?tab=settings">{t("gen.pages.settings.components.SettingsNavigationCards.gen_d0c54e51")}</Link>
          </Button>
        </CardContent>
        </Card>
      ) : null}

      {mode === "all" || mode === "routes" ? (
        <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle>{t("gen.pages.settings.components.SettingsNavigationCards.gen_0361f422")}</CardTitle>
          <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>
            为开书、拆章、正文生成和审核任务选择可用模型。
          </CardDescription>
        </CardHeader>
        <CardContent className={AUTO_DIRECTOR_MOBILE_CLASSES.settingsEntryActionRow}>
          <div className={`min-w-0 text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            路由健康时，自动导演和章节生产会按任务自动选择模型。
          </div>
          <Button asChild className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction}>
            <Link to="/settings/model-routes">{t("gen.pages.settings.components.SettingsNavigationCards.gen_4da087c6")}</Link>
          </Button>
        </CardContent>
        </Card>
      ) : null}
    </>
  );
}
