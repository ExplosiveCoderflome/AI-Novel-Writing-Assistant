import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getWorldList } from "@/api/world";
import { queryKeys } from "@/api/queryKeys";
import { featureFlags } from "@/config/featureFlags";

function extractStructuredPreview(raw: string): string | null {
  const text = raw.trim();
  if (!text || (!text.startsWith("[") && !text.startsWith("{"))) {
    return null;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) {
      const parts = parsed
        .slice(0, 2)
        .map((item) => {
          if (typeof item === "string") {
            return item.trim();
          }
          if (!item || typeof item !== "object") {
            return "";
          }
          const record = item as Record<string, unknown>;
          const title = [record.name, record.title, record.label].find((value) => typeof value === "string");
          const description = [record.description, record.content, record.detail].find((value) => typeof value === "string");
          if (typeof title === "string" && typeof description === "string") {
            return `${title.trim()}：${description.trim()}`;
          }
          if (typeof title === "string") {
            return title.trim();
          }
          if (typeof description === "string") {
            return description.trim();
          }
          return "";
        })
        .filter(Boolean);
      if (parts.length > 0) {
        return parts.join("；");
      }
      return "包含结构化设定，进入工作台查看详情。";
    }
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const summary = [record.summary, record.description, record.content].find((value) => typeof value === "string");
      if (typeof summary === "string" && summary.trim()) {
        return summary.trim();
      }
      return "包含结构化设定，进入工作台查看详情。";
    }
  } catch {
    return null;
  }

  return null;
}

function buildPreview(raw: string | null | undefined, fallback: string, limit: number): string {
  if (!raw?.trim()) {
    return fallback;
  }

  const normalized = raw.replace(/\s+/g, " ").trim();
  const structured = extractStructuredPreview(normalized);
  const preview = (structured ?? normalized).slice(0, limit);
  return preview.length < (structured ?? normalized).length ? `${preview}...` : preview;
}

export default function WorldList() {
  const worldListQuery = useQuery({
    queryKey: queryKeys.worlds.all,
    queryFn: getWorldList,
  });

  const worlds = worldListQuery.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {featureFlags.worldWizardEnabled ? (
          <Button asChild>
            <Link to="/worlds/generator">生成新世界观</Link>
          </Button>
        ) : null}
      </div>

      {worlds.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>暂无世界观</CardTitle>
            <CardDescription>点击“生成新世界观”开始创建。</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {worlds.map((world) => {
            const summary = buildPreview(world.description, "暂无描述", 120);
            const detail = buildPreview(
              world.overviewSummary ?? world.conflicts ?? world.geography ?? world.background,
              "暂无详细信息",
              180,
            );

            return (
              <Card key={world.id}>
                <CardHeader>
                  <CardTitle>{world.name}</CardTitle>
                  <CardDescription>
                    {summary} | 状态：{world.status} | v{world.version}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <div className="mb-2">{detail}</div>
                  {featureFlags.worldWizardEnabled ? (
                    <Button asChild size="sm">
                      <Link to={`/worlds/${world.id}/workspace`}>进入工作台</Link>
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
