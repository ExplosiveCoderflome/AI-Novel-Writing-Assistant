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
          <CardTitle>Knowledge base vector set</CardTitle>
          <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>
            You can start creating without configuration; when enabled, long-form settings, data, and context recall will be more stable.
                                    </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid min-w-0 gap-3 md:grid-cols-2">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Vector service provider</div>
              <div className={`mt-1 font-medium ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{ragProvider?.name ?? ragSettings?.embeddingProvider ?? "-"}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Vector model</div>
              <div className={`mt-1 font-medium ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{ragSettings?.embeddingModel ?? "-"}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>connection status</span>
            <Badge variant={ragProvider?.isConfigured ? "default" : "outline"}>
              {ragProvider?.isConfigured ? "API Key Available" : "API Key Missing"}
            </Badge>
            <Badge variant={ragProvider?.isActive ? "default" : "outline"}>
              {ragProvider?.isActive ? "Enabled" : "Not Enabled"}
            </Badge>
          </div>
          <Button asChild className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction}>
            <Link to="/knowledge?tab=settings">Open Knowledge Base Settings</Link></Button></CardContent></Card> ) : null} {mode === "all" || mode === "routes" ? (
        <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle>model routing</CardTitle>
          <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>
            Choose from available models for book opening, chapter opening, text generation, and review tasks.
                                    </CardDescription>
        </CardHeader>
        <CardContent className={AUTO_DIRECTOR_MOBILE_CLASSES.settingsEntryActionRow}>
          <div className={`min-w-0 text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            When routing is healthy, Auto Director and Chapter Production will automatically select models by task.
                                    </div>
          <Button asChild className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction}>
            <Link to="/settings/model-routes">Enter model routing management</Link>
          </Button>
        </CardContent>
        </Card>
      ) : null}
    </>
  );
}
