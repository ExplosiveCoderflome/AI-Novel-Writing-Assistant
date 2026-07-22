import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useEffect, useState } from "react";
import type { ChapterExecutionInsightsSidebarProps } from "./chapterInsights.types";
import CharacterDynamicsPanel from "./CharacterDynamicsPanel";
import ChapterExecutionOverviewPanel from "./ChapterExecutionOverviewPanel";
import ResourceRiskPanel from "./ResourceRiskPanel";
import TimelinePanel from "./TimelinePanel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobileViewport } from "@/components/layout/mobile/useIsMobileViewport";

function DesktopSidebar(props: ChapterExecutionInsightsSidebarProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "timeline" | "character" | "resources">("overview");

  useEffect(() => {
    setActiveTab("overview");
  }, [props.selectedChapter?.id]);

  return (
    <Card className="h-full overflow-hidden border-border/70 xl:flex xl:min-h-0 xl:flex-col">
      <CardHeader className="gap-3 border-b bg-gradient-to-b from-muted/30 via-background to-background pb-4 xl:shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionInsightsSidebar.gen_802a56bf")}</CardTitle>
            <p className="text-sm leading-6 text-muted-foreground">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionInsightsSidebar.gen_127a16e0")}</p>
          </div>
          <Badge variant="outline" className="shrink-0">
            {props.selectedChapter ? `第${props.selectedChapter.order}章` : t("gen.pages.novels.components.chapterInsights.ChapterExecutionInsightsSidebar.gen_d5084cea")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 p-0 xl:flex-1 xl:overflow-hidden">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "overview" | "timeline" | "character" | "resources")} className="xl:flex xl:h-full xl:min-h-0 xl:flex-col">
          <div className="shrink-0 border-b px-4 py-3">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-muted/50 p-1.5">
              <TabsTrigger value="overview" className="rounded-lg px-2 py-2 text-xs">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionInsightsSidebar.gen_33dacc88")}</TabsTrigger>
              <TabsTrigger value="timeline" className="rounded-lg px-2 py-2 text-xs">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionInsightsSidebar.gen_4404a8da")}</TabsTrigger>
              <TabsTrigger value="character" className="rounded-lg px-2 py-2 text-xs">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionInsightsSidebar.gen_bca8b138")}</TabsTrigger>
              <TabsTrigger value="resources" className="rounded-lg px-2 py-2 text-xs">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionInsightsSidebar.gen_5f848a1e")}</TabsTrigger>
            </TabsList>
          </div>
          <div className="min-h-0 xl:flex-1 xl:overflow-y-auto xl:px-4 xl:pb-4 xl:pt-4">
            <TabsContent value="overview" className="mt-0">
              <ChapterExecutionOverviewPanel
                selectedChapter={props.selectedChapter}
                chapterPlan={props.chapterPlan}
                chapterQualityReport={props.chapterQualityReport}
                chapterRuntimePackage={props.chapterRuntimePackage}
                reviewResult={props.reviewResult}
                openAuditIssues={props.openAuditIssues}
              />
            </TabsContent>
            <TabsContent value="timeline" className="mt-0">
              <TimelinePanel
                selectedChapter={props.selectedChapter}
                chapterTimeline={props.chapterTimeline}
                isLoadingChapterTimeline={props.isLoadingChapterTimeline}
                chapterRuntimePackage={props.chapterRuntimePackage}
              />
            </TabsContent>
            <TabsContent value="character" className="mt-0">
              <CharacterDynamicsPanel latestStateSnapshot={props.latestStateSnapshot} chapterStateSnapshot={props.chapterStateSnapshot} />
            </TabsContent>
            <TabsContent value="resources" className="mt-0">
              <ResourceRiskPanel {...props} />
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function MobileSidebar(props: ChapterExecutionInsightsSidebarProps) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/70 bg-background p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-foreground">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionInsightsSidebar.gen_802a56bf")}</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionInsightsSidebar.gen_127a16e0")}</div>
          </div>
          <Badge variant="outline">{props.selectedChapter ? `第${props.selectedChapter.order}章` : t("gen.pages.novels.components.chapterInsights.ChapterExecutionInsightsSidebar.gen_d5084cea")}</Badge>
        </div>
      </div>

      <details className="group rounded-xl border border-border/70 bg-background p-3" open>
        <summary className="cursor-pointer list-none">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionInsightsSidebar.gen_33dacc88")}</div>
            <Badge variant="secondary">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionInsightsSidebar.prioritizeView")}</Badge>
          </div>
        </summary>
        <div className="pt-3">
          <ChapterExecutionOverviewPanel
            selectedChapter={props.selectedChapter}
            chapterPlan={props.chapterPlan}
            chapterQualityReport={props.chapterQualityReport}
            chapterRuntimePackage={props.chapterRuntimePackage}
            reviewResult={props.reviewResult}
            openAuditIssues={props.openAuditIssues}
          />
        </div>
      </details>

      <details className="group rounded-xl border border-border/70 bg-background p-3" open>
        <summary className="cursor-pointer list-none">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionInsightsSidebar.gen_4404a8da")}</div>
            <Badge variant="secondary">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionInsightsSidebar.gen_18c63459")}</Badge>
          </div>
        </summary>
        <div className="pt-3">
          <TimelinePanel
            selectedChapter={props.selectedChapter}
            chapterTimeline={props.chapterTimeline}
            isLoadingChapterTimeline={props.isLoadingChapterTimeline}
            chapterRuntimePackage={props.chapterRuntimePackage}
          />
        </div>
      </details>

      <details className="group rounded-xl border border-border/70 bg-background p-3">
        <summary className="cursor-pointer list-none">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionInsightsSidebar.gen_bca8b138")}</div>
            <Badge variant="outline">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionInsightsSidebar.gen_02e099f5")}</Badge>
          </div>
        </summary>
        <div className="pt-3">
          <CharacterDynamicsPanel latestStateSnapshot={props.latestStateSnapshot} chapterStateSnapshot={props.chapterStateSnapshot} />
        </div>
      </details>

      <details className="group rounded-xl border border-border/70 bg-background p-3">
        <summary className="cursor-pointer list-none">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionInsightsSidebar.gen_9c4a1c29")}</div>
            <Badge variant="outline">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionInsightsSidebar.gen_02e099f5")}</Badge>
          </div>
        </summary>
        <div className="pt-3">
          <ResourceRiskPanel {...props} />
        </div>
      </details>
    </div>
  );
}

export default function ChapterExecutionInsightsSidebar(props: ChapterExecutionInsightsSidebarProps) {
  const isMobileViewport = useIsMobileViewport();

  if (isMobileViewport) {
    return <MobileSidebar {...props} />;
  }

  return <DesktopSidebar {...props} />;
}
