import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type {
  AuditReport,
  Chapter,
  ReplanRecommendation,
  ReplanResult,
  StoryPlan,
  StoryStateSnapshot,
} from "@ai-novel/shared/types/novel";
import type { SSEFrame } from "@ai-novel/shared/types/api";
import type { ChapterRuntimePackage } from "@ai-novel/shared/types/chapterRuntime";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StreamOutput from "@/components/common/StreamOutput";
import {
  ChapterRuntimeAuditCard,
  ChapterRuntimeContextCard,
  ChapterRuntimeLengthCard,
} from "../ChapterRuntimePanels";
import {
  hasText,
  parseChapterScenePlanForDisplay,
  type AssetTabKey,
  MetricBadge,
} from "../chapterExecution.shared";

interface ChapterExecutionReferencePanelProps {
  selectedChapter?: Chapter;
  assetTab: AssetTabKey;
  onAssetTabChange: (tab: AssetTabKey) => void;
  chapterPlan?: StoryPlan | null;
  latestStateSnapshot?: StoryStateSnapshot | null;
  chapterAuditReports: AuditReport[];
  replanRecommendation?: ReplanRecommendation | null;
  onReplanChapter: () => void;
  isReplanningChapter: boolean;
  lastReplanResult?: ReplanResult | null;
  chapterQualityReport?: {
    coherence: number;
    repetition: number;
    pacing: number;
    voice: number;
    engagement: number;
    overall: number;
    issues?: string | null;
  };
  chapterRuntimePackage?: ChapterRuntimePackage | null;
  reviewResult: {
    issues?: Array<{ category: string; fixSuggestion: string }>;
  } | null;
  openAuditIssues: Array<{ id: string; auditType: string; fixSuggestion: string }>;
  repairStreamContent: string;
  isRepairStreaming: boolean;
  repairStreamingChapterId?: string | null;
  repairStreamingChapterLabel?: string | null;
  repairRunStatus?: Extract<SSEFrame, { type: "run_status" }> | null;
  onAbortRepair: () => void;
}

function PanelHintCard(props: { title: string; content: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/90 p-3">
      <div className="text-xs text-muted-foreground">{props.title}</div>
      <div className="mt-2 text-sm leading-6 text-foreground">{props.content}</div>
    </div>
  );
}

function ReferenceNotice(props: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-sm text-amber-900">
      <div className="font-medium">{props.title}</div>
      <div className="mt-1 leading-6 text-amber-800">{props.description}</div>
    </div>
  );
}

export default function ChapterExecutionReferencePanel(props: ChapterExecutionReferencePanelProps) {
  const {
    selectedChapter,
    assetTab,
    onAssetTabChange,
    chapterPlan,
    latestStateSnapshot,
    chapterAuditReports,
    replanRecommendation,
    onReplanChapter,
    isReplanningChapter,
    lastReplanResult,
    chapterQualityReport,
    chapterRuntimePackage,
    reviewResult,
    openAuditIssues,
    repairStreamContent,
    isRepairStreaming,
    repairStreamingChapterId,
    repairStreamingChapterLabel,
    repairRunStatus,
    onAbortRepair,
  } = props;

  if (!selectedChapter) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-background p-4 text-sm leading-6 text-muted-foreground">
        选中章节后，这里会显示任务单、场景拆解、质量反馈、修复记录和诊断信息。
      </div>
    );
  }

  const runtimePackage = chapterRuntimePackage?.chapterId === selectedChapter.id ? chapterRuntimePackage : null;
  const chapterObjective = chapterPlan?.objective ?? selectedChapter.expectation ?? t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_6fc3748d");
  const scenePlan = parseChapterScenePlanForDisplay(selectedChapter);
  const isSelectedChapterRepairStreaming = isRepairStreaming && repairStreamingChapterId === selectedChapter.id;
  const isSelectedChapterRepairFinalizing = isSelectedChapterRepairStreaming && repairRunStatus?.phase === "finalizing";
  const visibleRepairStreamContent = repairStreamingChapterId === selectedChapter.id ? repairStreamContent : "";
  const hasVisibleRepairOutput = hasText(visibleRepairStreamContent);
  const repairingOtherChapter = isRepairStreaming && repairStreamingChapterId && repairStreamingChapterId !== selectedChapter.id;
  const detailTab = assetTab === "content" ? "taskSheet" : assetTab;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/70 bg-background p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-foreground">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_826a79d9")}</div>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">
              查看本章任务、质量和修复依据，不占用正文阅读区。
            </div>
          </div>
          <Badge variant="outline" className="shrink-0">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_0ad1bb1f")}</Badge>
        </div>
      </div>

      <Tabs value={detailTab} onValueChange={(value) => onAssetTabChange(value as AssetTabKey)}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-2xl bg-muted/50 p-1.5">
          <TabsTrigger value="taskSheet" className="rounded-xl text-xs">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.singleTask")}</TabsTrigger>
          <TabsTrigger value="sceneCards" className="rounded-xl text-xs">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_c931653c")}</TabsTrigger>
          <TabsTrigger value="quality" className="rounded-xl text-xs">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_3a7170b9")}</TabsTrigger>
          <TabsTrigger value="repair" className="rounded-xl text-xs">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_f82661e8")}</TabsTrigger>
          <TabsTrigger value="content" className="col-span-2 rounded-xl text-xs">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.contextDiagnosis")}</TabsTrigger>
        </TabsList>

        <TabsContent value="taskSheet" className="space-y-3">
          <div className="rounded-2xl border bg-muted/20 p-4">
            <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_d19149f0")}</div>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-7">
              {selectedChapter.taskSheet?.trim() || t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_ceb81222")}
            </div>
          </div>
          <PanelHintCard title={t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_85f9e2b5")} content={chapterObjective} />
          <PanelHintCard title={t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_076a259e")} content={latestStateSnapshot?.summary || t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_43e18541")} />
          <ChapterRuntimeContextCard
            runtimePackage={runtimePackage}
            chapterPlan={chapterPlan}
            stateSnapshot={latestStateSnapshot}
          />
        </TabsContent>

        <TabsContent value="sceneCards" className="space-y-3">
          <ChapterRuntimeLengthCard runtimePackage={runtimePackage} />
          {scenePlan ? (
            <div className="space-y-3">
              <div className="rounded-2xl border bg-muted/20 p-4">
                <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_41ffb541")}</div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <MetricBadge label={t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_85f9e2b5")} value={`${scenePlan.targetWordCount} 字`} />
                  <MetricBadge label={t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_1c433bf9")} value={String(scenePlan.scenes.length)} />
                </div>
              </div>
              {scenePlan.scenes.map((scene, index) => (
                <div key={scene.key} className="rounded-2xl border bg-background p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_67ba412c")}</Badge>
                    <Badge variant="secondary">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.targetWordCount")}</Badge>
                  </div>
                  <div className="mt-3 text-sm font-semibold text-foreground">{scene.title}</div>
                  <div className="mt-2 text-sm leading-6 text-muted-foreground">{scene.purpose}</div>
                  <div className="mt-3 space-y-2">
                    <PanelHintCard title={t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_133187a0")} content={scene.mustAdvance.join("；") || t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_d81bb206")} />
                    <PanelHintCard title={t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_3443f3cf")} content={scene.mustPreserve.join("；") || t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_d81bb206")} />
                    <PanelHintCard title={t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_8ed11315")} content={scene.entryState} />
                    <PanelHintCard title={t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_7624b2ba")} content={scene.exitState} />
                  </div>
                  {scene.forbiddenExpansion.length > 0 ? (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-sm leading-6 text-amber-900">
                      禁止展开：{scene.forbiddenExpansion.join("；")}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_d67bb4d4")}</div>
              <div className="mt-3 whitespace-pre-wrap text-sm leading-7">
                {selectedChapter.sceneCards?.trim()
                  ? t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_82295758")
                  : t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_87bfad6b")}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="quality" className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <MetricBadge label={t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_b141e85c")} value={String(chapterQualityReport?.overall ?? selectedChapter.qualityScore ?? "-")} />
            <MetricBadge label={t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_5995f0d3")} value={String(chapterQualityReport?.coherence ?? "-")} />
            <MetricBadge label={t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_3f842f0c")} value={String(chapterQualityReport?.repetition ?? "-")} />
            <MetricBadge label={t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_dd608458")} value={String(chapterQualityReport?.pacing ?? selectedChapter.pacingScore ?? "-")} />
            <MetricBadge label={t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_c50632e5")} value={String(chapterQualityReport?.voice ?? "-")} />
            <MetricBadge label={t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_0e4f9469")} value={String(chapterQualityReport?.engagement ?? "-")} />
          </div>

          <div className="rounded-2xl border p-4 text-sm">
            <div className="font-semibold text-foreground">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_8e6ed341")}</div>
            {reviewResult?.issues?.length ? (
              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                {reviewResult.issues.slice(0, 5).map((item, index) => (
                  <div key={`${item.category}-${index}`} className="rounded-xl border p-3">
                    <div className="font-medium text-foreground">{item.category}</div>
                    <div className="mt-1 leading-6">{item.fixSuggestion}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-xs leading-6 text-muted-foreground">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_a9e1fde8")}</div>
            )}
          </div>

          <div className="rounded-2xl border p-4 text-sm">
            <div className="font-semibold text-foreground">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_df38622b")}</div>
            {openAuditIssues.length > 0 ? (
              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                {openAuditIssues.slice(0, 6).map((item) => (
                  <div key={item.id} className="rounded-xl border p-3">
                    <div className="font-medium text-foreground">{item.auditType}</div>
                    <div className="mt-1 leading-6">{item.fixSuggestion}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-xs leading-6 text-muted-foreground">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_6de9e52d")}</div>
            )}
          </div>

          <ChapterRuntimeAuditCard
            runtimePackage={runtimePackage}
            auditReports={chapterAuditReports}
            replanRecommendation={replanRecommendation}
            onReplan={onReplanChapter}
            isReplanning={isReplanningChapter}
            lastReplanResult={lastReplanResult}
          />
        </TabsContent>

        <TabsContent value="repair" className="space-y-3">
          {repairingOtherChapter ? (
            <ReferenceNotice
              title={t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_153d3586")}
              description={`${repairStreamingChapterLabel ?? t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_08e4466c")} 仍在修复中。当前章节不会显示那一章的修复流，返回对应章节即可继续查看。`}
            />
          ) : null}

          {(isSelectedChapterRepairStreaming || hasVisibleRepairOutput) ? (
            <StreamOutput
              title={t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_f7defa22")}
              emptyText={isSelectedChapterRepairFinalizing
                ? (repairRunStatus?.message ?? t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_0c718979"))
                : t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_a4721a68")}
              content={visibleRepairStreamContent}
              isStreaming={isSelectedChapterRepairStreaming}
              onAbort={isSelectedChapterRepairFinalizing ? undefined : onAbortRepair}
            />
          ) : null}

          <div className="rounded-2xl border bg-muted/20 p-4">
            <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_57ef330b")}</div>
            <div className="mt-3 max-h-[420px] overflow-y-auto whitespace-pre-wrap text-sm leading-7">
              {selectedChapter.repairHistory?.trim() || t("gen.pages.novels.components.chapterInsights.ChapterExecutionReferencePanel.gen_6dbece44")}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="content" className="space-y-3">
          <ChapterRuntimeContextCard
            runtimePackage={null}
            chapterPlan={chapterPlan}
            stateSnapshot={latestStateSnapshot}
          />
          <ChapterRuntimeAuditCard
            runtimePackage={null}
            auditReports={chapterAuditReports}
            replanRecommendation={replanRecommendation}
            onReplan={onReplanChapter}
            isReplanning={isReplanningChapter}
            lastReplanResult={lastReplanResult}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
