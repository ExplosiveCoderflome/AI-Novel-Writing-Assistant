import i18next from "i18next";
import { useQuery } from "@tanstack/react-query";
import { Database, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { getRagSettings } from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import StyleEngineRuntimeSettingsCard from "../components/StyleEngineRuntimeSettingsCard";
import { SettingsShell } from "../components/SettingsShell";

export default function KnowledgeSettingsPage() {
  const ragQuery = useQuery({ queryKey: queryKeys.settings.rag, queryFn: getRagSettings });
  const rag = ragQuery.data?.data;
  return (
    <SettingsShell title={i18next.t("settings.settingsShell.wjpyew")} description={i18next.t("settings.knowledgeSettingsPage.go2ro1")}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Database className="h-4 w-4" />{i18next.t("settings.knowledgeSettingsPage.aeia5o")}</CardTitle>
          <CardDescription>
            {ragQuery.isLoading ? "正在读取检索状态..." : rag?.enabled ? i18next.t("settings.knowledgeSettingsPage.w3ofmx", { val1: (rag.embeddingModel || "默认向量模型") }) : "资料检索未开启，开书和章节生产仍可正常进行。"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{i18next.t("settings.knowledgeSettingsPage.ndu84e")}</p>
          <Button asChild variant="outline"><Link to="/knowledge?tab=settings">{i18next.t("settings.knowledgeSettingsPage.iuxmub")}<ExternalLink className="h-4 w-4" /></Link></Button>
        </CardContent>
      </Card>
      <StyleEngineRuntimeSettingsCard />
    </SettingsShell>
  );
}
