import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DIRECTOR_CORRECTION_PRESETS,
  type DirectorCandidate,
  type DirectorCandidateBatch,
  type DirectorCorrectionPreset,
} from "@ai-novel/shared/types/novelDirector";
import {
  confirmDirectorCandidate,
  generateDirectorCandidates,
  refineDirectorCandidates,
} from "@/api/novelDirector";
import { queryKeys } from "@/api/queryKeys";
import LLMSelector from "@/components/common/LLMSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useLLMStore } from "@/store/llmStore";
import type { NovelBasicFormState } from "../novelBasicInfo.shared";

interface NovelAutoDirectorDialogProps {
  basicForm: NovelBasicFormState;
  onConfirmed: (novelId: string) => void;
}

function buildInitialIdea(basicForm: NovelBasicFormState): string {
  const lines = [
    basicForm.description.trim(),
    basicForm.title.trim() ? `我想写一本暂名为《${basicForm.title.trim()}》的小说。` : "",
    basicForm.styleTone.trim() ? `文风希望偏 ${basicForm.styleTone.trim()}。` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function buildRequestPayload(
  basicForm: NovelBasicFormState,
  idea: string,
  llm: ReturnType<typeof useLLMStore.getState>,
) {
  return {
    idea: idea.trim(),
    title: basicForm.title.trim() || undefined,
    description: basicForm.description.trim() || undefined,
    genreId: basicForm.genreId || undefined,
    worldId: basicForm.worldId || undefined,
    writingMode: basicForm.writingMode,
    projectMode: basicForm.projectMode,
    narrativePov: basicForm.narrativePov,
    pacePreference: basicForm.pacePreference,
    styleTone: basicForm.styleTone.trim() || undefined,
    emotionIntensity: basicForm.emotionIntensity,
    aiFreedom: basicForm.aiFreedom,
    defaultChapterLength: basicForm.defaultChapterLength,
    estimatedChapterCount: basicForm.estimatedChapterCount,
    projectStatus: basicForm.projectStatus,
    storylineStatus: basicForm.storylineStatus,
    outlineStatus: basicForm.outlineStatus,
    resourceReadyScore: basicForm.resourceReadyScore,
    sourceNovelId: basicForm.sourceNovelId || undefined,
    sourceKnowledgeDocumentId: basicForm.sourceKnowledgeDocumentId || undefined,
    continuationBookAnalysisId: basicForm.continuationBookAnalysisId || undefined,
    continuationBookAnalysisSections: basicForm.continuationBookAnalysisSections.length > 0
      ? basicForm.continuationBookAnalysisSections
      : undefined,
    provider: llm.provider,
    model: llm.model,
    temperature: llm.temperature,
  };
}

function summarizeCurrentContext(basicForm: NovelBasicFormState): string[] {
  return [
    basicForm.genreId ? `已选类型：${basicForm.genreId}` : "",
    basicForm.worldId ? `已绑定世界观：${basicForm.worldId}` : "",
    `创作模式：${basicForm.writingMode}`,
    `项目模式：${basicForm.projectMode}`,
    `视角：${basicForm.narrativePov}`,
    `节奏：${basicForm.pacePreference}`,
    `情绪：${basicForm.emotionIntensity}`,
    basicForm.styleTone.trim() ? `文风：${basicForm.styleTone.trim()}` : "",
    `预计章节：${basicForm.estimatedChapterCount}`,
  ].filter(Boolean);
}

function renderCandidateDetails(candidate: DirectorCandidate) {
  return [
    { label: "作品定位", value: candidate.positioning },
    { label: "核心卖点", value: candidate.sellingPoint },
    { label: "主线冲突", value: candidate.coreConflict },
    { label: "主角路径", value: candidate.protagonistPath },
    { label: "主钩子", value: candidate.hookStrategy },
    { label: "推进循环", value: candidate.progressionLoop },
    { label: "结局方向", value: candidate.endingDirection },
    { label: "章节规模", value: `约 ${candidate.targetChapterCount} 章` },
  ];
}

export default function NovelAutoDirectorDialog({
  basicForm,
  onConfirmed,
}: NovelAutoDirectorDialogProps) {
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [idea, setIdea] = useState("");
  const [feedback, setFeedback] = useState("");
  const [selectedPresets, setSelectedPresets] = useState<DirectorCorrectionPreset[]>([]);
  const [batches, setBatches] = useState<DirectorCandidateBatch[]>([]);

  useEffect(() => {
    if (!open || idea.trim()) {
      return;
    }
    setIdea(buildInitialIdea(basicForm));
  }, [basicForm, idea, open]);

  const currentContextLines = useMemo(() => summarizeCurrentContext(basicForm), [basicForm]);
  const latestBatch = batches.at(-1) ?? null;

  const generateMutation = useMutation({
    mutationFn: async () => {
      const payload = buildRequestPayload(basicForm, idea, llm);
      const response = batches.length === 0
        ? await generateDirectorCandidates(payload)
        : await refineDirectorCandidates({
          ...payload,
          previousBatches: batches,
          presets: selectedPresets,
          feedback: feedback.trim() || undefined,
        });
      return response.data?.batch ?? null;
    },
    onSuccess: (batch) => {
      if (!batch) {
        toast.error("自动导演没有返回可用方案。");
        return;
      }
      setBatches((prev) => [...prev, batch]);
      setFeedback("");
      setSelectedPresets([]);
      toast.success(`${batch.roundLabel} 已生成 ${batch.candidates.length} 套方案。`);
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async (candidate: DirectorCandidate) => {
      const response = await confirmDirectorCandidate({
        ...buildRequestPayload(basicForm, idea, llm),
        batchId: latestBatch?.id,
        round: latestBatch?.round,
        candidate,
      });
      return response.data ?? null;
    },
    onSuccess: async (data) => {
      const novelId = data?.novel?.id;
      if (!novelId) {
        toast.error("确认方案失败，未返回小说项目。");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.all });
      toast.success(`已创建《${data.novel.title}》，并生成 ${data.createdChapterCount} 章骨架。`);
      resetDialog();
      onConfirmed(novelId);
    },
  });

  const togglePreset = (preset: DirectorCorrectionPreset) => {
    setSelectedPresets((prev) => (
      prev.includes(preset)
        ? prev.filter((item) => item !== preset)
        : [...prev, preset]
    ));
  };

  const resetDialog = () => {
    setOpen(false);
    setIdea("");
    setFeedback("");
    setSelectedPresets([]);
    setBatches([]);
  };

  const canGenerate = idea.trim().length > 0 && !generateMutation.isPending;

  return (
    <>
      <div className="flex items-center justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          AI 自动导演创建
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(next) => (!next ? resetDialog() : setOpen(true))}>
        <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AI 自动导演创建</DialogTitle>
            <DialogDescription>
              先让 AI 给你 2 套整本方向，再由你做书级确认；如果都不满意，也可以继续说哪里不对，
              系统会按你的修正建议生成下一轮。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-background/80 p-4">
              <div className="text-sm font-medium text-foreground">你的起始想法</div>
              <textarea
                className="mt-2 min-h-[128px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                value={idea}
                onChange={(event) => setIdea(event.target.value)}
                placeholder="例如：普通女大学生误入异能组织，一边上学打工，一边调查父亲失踪真相。"
              />
              <div className="mt-3">
                <LLMSelector />
              </div>
              <div className="mt-3 rounded-md border bg-muted/20 p-3">
                <div className="text-xs font-medium text-foreground">当前会一起参与判断的创建页信息</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {currentContextLines.length > 0 ? currentContextLines.map((line) => (
                    <Badge key={line} variant="secondary">{line}</Badge>
                  )) : (
                    <span className="text-xs text-muted-foreground">
                      目前主要依赖你的灵感描述，也可以回创建页先补类型、文风或章节规模。
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button type="button" onClick={() => generateMutation.mutate()} disabled={!canGenerate}>
                  {generateMutation.isPending
                    ? "生成中..."
                    : batches.length === 0
                      ? "生成第一批方案"
                      : "按修正建议继续生成"}
                </Button>
              </div>
            </div>

            {batches.length > 0 ? (
              <div className="space-y-4">
                {batches.map((batch) => (
                  <section key={batch.id} className="rounded-xl border p-4">
                    <div className="flex flex-col gap-2 border-b pb-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-base font-semibold text-foreground">{batch.roundLabel}</div>
                        <div className="text-sm text-muted-foreground">
                          {batch.refinementSummary?.trim() || "初始方案"}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {batch.presets.map((preset) => {
                          const meta = DIRECTOR_CORRECTION_PRESETS.find((item) => item.value === preset);
                          return meta ? <Badge key={preset} variant="outline">{meta.label}</Badge> : null;
                        })}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 xl:grid-cols-2">
                      {batch.candidates.map((candidate) => (
                        <article key={candidate.id} className="rounded-xl border bg-background p-4 shadow-sm">
                          <div className="space-y-2">
                            <div className="text-lg font-semibold text-foreground">{candidate.workingTitle}</div>
                            <div className="text-sm leading-6 text-muted-foreground">{candidate.logline}</div>
                            <div className="rounded-md bg-muted/30 p-3 text-sm leading-6 text-foreground">
                              <div className="font-medium">为什么推荐这套</div>
                              <div className="mt-1 text-muted-foreground">{candidate.whyItFits}</div>
                            </div>
                            <div className="grid gap-2 text-sm">
                              {renderCandidateDetails(candidate).map((item) => (
                                <div key={item.label}>
                                  <span className="font-medium text-foreground">{item.label}：</span>
                                  <span className="text-muted-foreground">{item.value}</span>
                                </div>
                              ))}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {candidate.toneKeywords.map((keyword) => (
                                <Badge key={keyword} variant="secondary">{keyword}</Badge>
                              ))}
                            </div>
                          </div>

                          <div className="mt-4 flex justify-end">
                            <Button
                              type="button"
                              onClick={() => confirmMutation.mutate(candidate)}
                              disabled={confirmMutation.isPending}
                            >
                              {confirmMutation.isPending && confirmMutation.variables?.id === candidate.id
                                ? "确认中..."
                                : "选用这套并创建项目"}
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}

                <section className="rounded-xl border border-dashed p-4">
                  <div className="text-base font-semibold text-foreground">继续修正并生成下一轮</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    如果这几套还不够对味，可以点几个方向，再补一句你真正想要的感觉。系统会保留上一轮，
                    再给你一轮新的方案。
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {DIRECTOR_CORRECTION_PRESETS.map((preset) => {
                      const active = selectedPresets.includes(preset.value);
                      return (
                        <button
                          key={preset.value}
                          type="button"
                          className={`rounded-full border px-3 py-1.5 text-sm transition ${
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-foreground hover:border-primary/40"
                          }`}
                          onClick={() => togglePreset(preset.value)}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-4 space-y-2">
                    <label htmlFor="director-refine-feedback" className="text-sm font-medium text-foreground">
                      再补一句修正建议
                    </label>
                    <Input
                      id="director-refine-feedback"
                      value={feedback}
                      onChange={(event) => setFeedback(event.target.value)}
                      placeholder="例如：我想要女频成长感更强一点，别太像纯爽文，也不要太黑。"
                    />
                  </div>

                  <div className="mt-4 flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => generateMutation.mutate()}
                      disabled={generateMutation.isPending || !idea.trim()}
                    >
                      {generateMutation.isPending ? "生成中..." : "带修正建议继续生成"}
                    </Button>
                  </div>
                </section>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                先给 AI 一句灵感，它会先产出第一批整本方向候选。
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
