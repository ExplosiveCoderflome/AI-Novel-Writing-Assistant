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
          toast.error(error instanceof Error ? error.message : "Old data detection failed.");
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
  const title = hasSuggestedSource ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." : "Import old version database";
  const description = hasSuggestedSource
    ? "The desktop version has detected the local database used by your previous web/development version, and can import and take over the original novel, API Key and knowledge base data with one click."
    : "The desktop version uses a separate data directory by default. If you already have local data in the web/development version, you can choose the old dev.db to import to the desktop version.";

  const importData = async (preferSuggested: boolean) => {
    try {
      setIsImporting(true);
      const result = await importDesktopLegacyDatabase({ preferSuggested });
      if (result?.cancelled) {
        return;
      }
      if (result?.scheduled) {
        toast("Preparing to import old data, the application will automatically restart.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to import old data.");
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
          {snapshot?.currentDatabaseLikelyFresh ? <Badge variant="outline">The current desktop library appears to be empty</Badge> : null}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {snapshot?.suggestedSourcePath ? (
          <div className="rounded-md border border-dashed bg-background/70 p-3 text-sm text-muted-foreground">
            Old library detected:{snapshot.suggestedSourcePath}
            {snapshot.suggestedSourceLabel ? ` (${snapshot.suggestedSourceLabel})` : ""}
          </div>
        ) : null}

        <div className="rounded-md border border-dashed bg-background/70 p-3 text-sm text-muted-foreground">
          Before importing, the current desktop database will be automatically backed up to:{snapshot?.backupDirectory ?? "-"}
        </div>

        <div className="text-xs text-muted-foreground">
          Please close the old web/development version process before importing to avoid that the same SQLite file is still being written.
                          </div>

        <div className="flex flex-wrap gap-3">
          {hasSuggestedSource ? (
            <Button onClick={() => void importData(true)} disabled={isImporting || isLoadingSnapshot}>
              {isImporting ? "Preparing..." : "Importing detected old data"}
            </Button>
          ) : null}
          <Button
            variant={hasSuggestedSource ? "outline" : "default"}
            onClick={() => void importData(false)}
            disabled={isImporting || isLoadingSnapshot}
          >
            {isImporting ? "Preparing..." : hasSuggestedSource ? "Select another dev.db" : "Select an old dev.db to import"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
