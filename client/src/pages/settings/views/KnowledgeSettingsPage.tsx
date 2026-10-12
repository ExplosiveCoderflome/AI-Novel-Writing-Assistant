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
    <SettingsShell title="知识库与写法" description="这些增强项会帮助 AI 理解你的资料和写法，不影响你先开始创作。">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Database className="h-4 w-4" />知识库检索</CardTitle>
          <CardDescription>
            {ragQuery.isLoading ? "正在读取检索状态..." : rag?.enabled ? `资料检索已开启，当前使用 ${rag.embeddingModel || "默认向量模型"}。` : "资料检索未开启，开书和章节生产仍可正常进行。"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">向量模型、资料库地址、索引和召回参数都在同一个检索配置页维护。</p>
          <Button asChild variant="outline"><Link to="/knowledge?tab=settings">配置检索<ExternalLink className="h-4 w-4" /></Link></Button>
        </CardContent>
      </Card>
      <StyleEngineRuntimeSettingsCard />
    </SettingsShell>
  );
}
