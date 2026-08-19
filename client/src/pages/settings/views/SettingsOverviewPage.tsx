import i18next from "i18next";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpenCheck, Bot, Database, MonitorCog } from "lucide-react";
import { Link } from "react-router-dom";
import {
  getAPIKeySettings,
  getModelRoutes,
  getRagSettings,
  getStyleEngineRuntimeSettings,
  testModelRouteConnectivity,
} from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import SettingsReadinessCard, { buildSettingsReadinessItems } from "../components/SettingsReadinessCard";
import { SettingsShell } from "../components/SettingsShell";
import { APP_RUNTIME } from "@/lib/constants";

const entries = [
  { to: "/settings/models", title: i18next.t("settings.settingsShell.5a5e0"), description: i18next.t("settings.settingsOverviewPage.17wec7"), icon: Bot },
  { to: "/settings/director", title: i18next.t("autoDirector.context"), description: i18next.t("settings.settingsOverviewPage.b1cook"), icon: BookOpenCheck },
  { to: "/settings/knowledge", title: i18next.t("settings.settingsShell.wjpyew"), description: i18next.t("settings.settingsOverviewPage.9nhb0i"), icon: Database },
  { to: "/settings/maintenance", title: i18next.t("settings.settingsShell.11hieg"), description: i18next.t("settings.settingsOverviewPage.166ifx"), icon: MonitorCog },
];

export default function SettingsOverviewPage() {
  const providersQuery = useQuery({ queryKey: queryKeys.settings.apiKeys, queryFn: getAPIKeySettings });
  const routesQuery = useQuery({ queryKey: queryKeys.settings.modelRoutes, queryFn: getModelRoutes });
  const connectivityQuery = useQuery({
    queryKey: queryKeys.settings.modelRouteConnectivity,
    queryFn: testModelRouteConnectivity,
    enabled: routesQuery.isSuccess,
    refetchOnWindowFocus: false,
  });
  const ragQuery = useQuery({ queryKey: queryKeys.settings.rag, queryFn: getRagSettings });
  const styleQuery = useQuery({ queryKey: queryKeys.settings.styleEngineRuntime, queryFn: getStyleEngineRuntimeSettings });
  const items = useMemo(() => buildSettingsReadinessItems({
    providers: providersQuery.data?.data ?? [],
    modelRoutes: routesQuery.data?.data,
    modelRouteConnectivity: connectivityQuery.data?.data,
    ragSettings: ragQuery.data?.data,
    styleSettings: styleQuery.data?.data,
    isModelRoutesChecking: connectivityQuery.isPending || connectivityQuery.isFetching,
    isStyleSettingsLoaded: styleQuery.isSuccess,
  }), [connectivityQuery.data?.data, connectivityQuery.isFetching, connectivityQuery.isPending, providersQuery.data?.data, ragQuery.data?.data, routesQuery.data?.data, styleQuery.data?.data, styleQuery.isSuccess]);
  const configuredProvider = providersQuery.data?.data?.find((item) => item.isConfigured && item.isActive);
  const routeCount = routesQuery.data?.data?.routes.filter((route) => route.provider && route.model).length ?? 0;
  const rag = ragQuery.data?.data;

  return (
    <SettingsShell title={i18next.t("sidebar.settings")} description={i18next.t("settings.settingsOverviewPage.h1em1m")}>
      <SettingsReadinessCard items={items} />
      <div className="grid gap-4 md:grid-cols-2">
        {entries.map(({ to, title, description, icon: Icon }) => {
          const summary = title === "模型与厂商"
            ? configuredProvider ? i18next.t("settings.settingsOverviewPage.3c071i", { val1: (configuredProvider.name), val2: (configuredProvider.currentModel || "未选择模型"), val3: (routeCount) }) : "尚未配置可用的文本模型"
            : title === "知识库与写法"
              ? rag?.enabled ? i18next.t("settings.settingsOverviewPage.rbwmb5", { val1: (rag.embeddingModel || "未选择向量模型") }) : "可选增强，暂不影响开始创作"
              : title === "桌面与维护"
                ? APP_RUNTIME === "desktop" ? "可检查桌面更新和本机旧数据" : "网页端无需桌面维护"
                : "设置确认偏好、问题处理和通知方式";
          return (
            <Card key={to} className="min-w-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Icon className="h-4 w-4" />{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-end justify-between gap-3">
                <p className="text-sm text-muted-foreground">{summary}</p>
                <Button asChild variant="outline" size="sm" className="shrink-0"><Link to={to}>{i18next.t("settings.settingsOverviewPage.h8ul")}<ArrowRight className="h-4 w-4" /></Link></Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </SettingsShell>
  );
}
