import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { getAgentCatalog } from "@/api/agentCatalog";
import { queryKeys } from "@/api/queryKeys";
import ChatPage from "./ChatPage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function toCategoryLabel(category: string): string {
  if (category === "read") return t("gen.pages.chat.CreativeHubPage.gen_0cd5db00");
  if (category === "inspect") return t("gen.pages.chat.CreativeHubPage.gen_fd4bef54");
  if (category === "mutate") return t("gen.pages.chat.CreativeHubPage.gen_8347a927");
  if (category === "run") return t("gen.pages.chat.CreativeHubPage.gen_1a6aa24e");
  return category;
}

export default function CreativeHubPage() {
  const [searchParams] = useSearchParams();
  const boundNovelId = searchParams.get("novelId")?.trim() ?? "";
  const boundRunId = searchParams.get("runId")?.trim() ?? "";
  const catalogQuery = useQuery({
    queryKey: queryKeys.agentCatalog,
    queryFn: getAgentCatalog,
    staleTime: 60_000,
  });

  const catalog = catalogQuery.data?.data;
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tool of catalog?.tools ?? []) {
      counts.set(tool.category, (counts.get(tool.category) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [catalog?.tools]);

  return (
    <div className="space-y-4">
      <Card className="border-slate-200 bg-gradient-to-r from-slate-50 to-white">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <CardTitle>{t("gen.pages.chat.CreativeHubPage.gen_d50f61ff")}</CardTitle>
            <CardDescription>
              这里不是单纯聊天页，而是当前小说工作区的命令、状态、诊断和审批入口。
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Agent {catalog?.agents.length ?? 0}</Badge>
            <Badge variant="secondary">Tools {catalog?.tools.length ?? 0}</Badge>
            {boundNovelId ? <Badge variant="outline">{t("gen.pages.chat.CreativeHubPage.gen_08928ecc")}</Badge> : null}
            {boundRunId ? <Badge variant="outline">{t("gen.pages.chat.CreativeHubPage.gen_0c658f29")}</Badge> : null}
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {categoryCounts.map(([category, count]) => (
            <Badge key={category} variant="outline">
              {toCategoryLabel(category)} {count}
            </Badge>
          ))}
          {catalogQuery.isLoading ? <span>{t("gen.pages.chat.CreativeHubPage.gen_1797e8d8")}</span> : null}
        </CardContent>
      </Card>

      <ChatPage />
    </div>
  );
}
