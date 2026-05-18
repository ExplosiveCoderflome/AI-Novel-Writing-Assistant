import { useEffect, useState } from "react";
import type { ChapterExecutionInsightsSidebarProps } from "./chapterInsights.types";
import CharacterDynamicsPanel from "./CharacterDynamicsPanel";
import ResourceRiskPanel from "./ResourceRiskPanel";
import TimelinePanel from "./TimelinePanel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobileViewport } from "@/components/layout/mobile/useIsMobileViewport";

function DesktopSidebar(props: ChapterExecutionInsightsSidebarProps) {
  const [activeTab, setActiveTab] = useState<"timeline" | "character" | "resources">("timeline");

  useEffect(() => {
    setActiveTab("timeline");
  }, [props.selectedChapter?.id]);

  return (
    <Card className="overflow-hidden border-border/70 xl:flex xl:max-h-[calc(100vh-2rem)] xl:flex-col">
      <CardHeader className="gap-3 border-b bg-gradient-to-b from-muted/30 via-background to-background pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">未来动态侧栏</CardTitle>
            <p className="text-sm leading-6 text-muted-foreground">默认先看时间线，再看角色动态，最后看资源与风险。</p>
          </div>
          <Badge variant="outline" className="shrink-0">
            {props.selectedChapter ? `第${props.selectedChapter.order}章` : "未选章节"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0 xl:flex-1 xl:overflow-hidden">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "timeline" | "character" | "resources")} className="xl:flex xl:h-full xl:flex-col">
          <div className="border-b px-4 py-3">
            <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl bg-muted/50 p-1.5">
              <TabsTrigger value="timeline" className="rounded-lg px-2 py-2 text-xs">时间线</TabsTrigger>
              <TabsTrigger value="character" className="rounded-lg px-2 py-2 text-xs">角色动态</TabsTrigger>
              <TabsTrigger value="resources" className="rounded-lg px-2 py-2 text-xs">资源与风险</TabsTrigger>
            </TabsList>
          </div>
          <div className="xl:flex-1 xl:overflow-y-auto xl:px-4 xl:pb-4 xl:pt-4">
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
            <div className="text-sm font-semibold text-foreground">未来动态侧栏</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">先看时间线，再看角色动态和资源风险。</div>
          </div>
          <Badge variant="outline">{props.selectedChapter ? `第${props.selectedChapter.order}章` : "未选章节"}</Badge>
        </div>
      </div>

      <details className="group rounded-xl border border-border/70 bg-background p-3" open>
        <summary className="cursor-pointer list-none">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-foreground">时间线</div>
            <Badge variant="secondary">默认</Badge>
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
            <div className="text-sm font-medium text-foreground">角色动态</div>
            <Badge variant="outline">展开查看</Badge>
          </div>
        </summary>
        <div className="pt-3">
          <CharacterDynamicsPanel latestStateSnapshot={props.latestStateSnapshot} chapterStateSnapshot={props.chapterStateSnapshot} />
        </div>
      </details>

      <details className="group rounded-xl border border-border/70 bg-background p-3">
        <summary className="cursor-pointer list-none">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-foreground">资源与风险</div>
            <Badge variant="outline">展开查看</Badge>
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
