import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getRagSettings } from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsNavigationCards() {
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
      <Card>
        <CardHeader>
          <CardTitle>知识库向量设置</CardTitle>
          <CardDescription>在知识库模块配置向量模型、索引范围和检索参数。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">向量服务商</div>
              <div className="mt-1 font-medium">{ragProvider?.name ?? ragSettings?.embeddingProvider ?? "-"}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">向量模型</div>
              <div className="mt-1 font-medium">{ragSettings?.embeddingModel ?? "-"}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>连接状态</span>
            <Badge variant={ragProvider?.isConfigured ? "default" : "outline"}>
              {ragProvider?.isConfigured ? "API Key 可用" : "缺少 API Key"}
            </Badge>
            <Badge variant={ragProvider?.isActive ? "default" : "outline"}>
              {ragProvider?.isActive ? "启用中" : "未启用"}
            </Badge>
          </div>
          <Button asChild>
            <Link to="/knowledge?tab=settings">打开知识库设置</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>模型路由</CardTitle>
          <CardDescription>为不同写作任务选择默认服务商和模型。</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            集中管理开书、拆章、正文生成、审核等任务使用的模型。
          </div>
          <Button asChild>
            <Link to="/settings/model-routes">进入模型路由管理</Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
