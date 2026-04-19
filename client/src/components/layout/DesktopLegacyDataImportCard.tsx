import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { APP_RUNTIME, APP_RUNTIME_IS_PACKAGED } from "@/lib/constants";
import {
  getDesktopDataImportSnapshot,
  importDesktopLegacyDatabase,
  type DesktopDataImportSnapshot,
} from "@/lib/desktop";

interface DesktopLegacyDataImportCardProps {
  forceVisible?: boolean;
  compact?: boolean;
}

function shouldRenderCard(
  snapshot: DesktopDataImportSnapshot | null,
  forceVisible: boolean,
): boolean {
  if (forceVisible) {
    return true;
  }

  if (!snapshot) {
    return false;
  }

  return snapshot.currentDatabaseLikelyFresh || Boolean(snapshot.suggestedSourcePath);
}

export default function DesktopLegacyDataImportCard({
  forceVisible = false,
  compact = false,
}: DesktopLegacyDataImportCardProps) {
  const isSupportedDesktop = APP_RUNTIME === "desktop" && APP_RUNTIME_IS_PACKAGED;
  const [snapshot, setSnapshot] = useState<DesktopDataImportSnapshot | null>(null);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (!isSupportedDesktop) {
      return;
    }

    let cancelled = false;
    setIsLoadingSnapshot(true);

    void getDesktopDataImportSnapshot()
      .then((nextSnapshot) => {
        if (!cancelled) {
          setSnapshot(nextSnapshot);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "旧数据探测失败。");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingSnapshot(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isSupportedDesktop]);

  if (!isSupportedDesktop || !shouldRenderCard(snapshot, forceVisible)) {
    return null;
  }

  const hasSuggestedSource = Boolean(snapshot?.suggestedSourcePath);
  const title = hasSuggestedSource ? "检测到旧版本地数据库" : "导入旧版本地数据库";
  const description = hasSuggestedSource
    ? "桌面版检测到了你之前 web/开发版使用的本地数据库，可以一键导入并接管原有小说、API Key 和知识库数据。"
    : "桌面版默认使用独立数据目录。如果你之前在 web/开发版里已经有本地数据，可以选择旧的 dev.db 导入到桌面版。";

  const importData = async (preferSuggested: boolean) => {
    try {
      setIsImporting(true);
      const result = await importDesktopLegacyDatabase({ preferSuggested });
      if (result?.cancelled) {
        return;
      }
      if (result?.scheduled) {
        toast("正在准备导入旧数据，应用会自动重启一次。");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导入旧数据失败。");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Card className="border-sky-200 bg-sky-50/80">
      <CardHeader className={compact ? "pb-3" : undefined}>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{title}</CardTitle>
          <Badge variant="outline">Desktop</Badge>
          {snapshot?.currentDatabaseLikelyFresh ? <Badge variant="outline">当前桌面库看起来是空的</Badge> : null}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {snapshot?.suggestedSourcePath ? (
          <div className="rounded-md border border-dashed bg-background/70 p-3 text-sm text-muted-foreground">
            已检测到旧库：{snapshot.suggestedSourcePath}
            {snapshot.suggestedSourceLabel ? ` (${snapshot.suggestedSourceLabel})` : ""}
          </div>
        ) : null}

        <div className="rounded-md border border-dashed bg-background/70 p-3 text-sm text-muted-foreground">
          导入前会自动备份当前桌面数据库到：{snapshot?.backupDirectory ?? "-"}
        </div>

        <div className="text-xs text-muted-foreground">
          导入前请先关闭旧的 web/开发版进程，避免同一份 SQLite 文件还在被写入。
        </div>

        <div className="flex flex-wrap gap-3">
          {hasSuggestedSource ? (
            <Button onClick={() => void importData(true)} disabled={isImporting || isLoadingSnapshot}>
              {isImporting ? "Preparing..." : "导入检测到的旧数据"}
            </Button>
          ) : null}
          <Button
            variant={hasSuggestedSource ? "outline" : "default"}
            onClick={() => void importData(false)}
            disabled={isImporting || isLoadingSnapshot}
          >
            {isImporting ? "Preparing..." : hasSuggestedSource ? "选择其他 dev.db" : "选择旧 dev.db 导入"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
