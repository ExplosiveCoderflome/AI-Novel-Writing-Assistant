import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  buildFullBookAutopilotExecutionPlan,
  type DirectorCandidate,
  type DirectorCandidateBatch,
} from "@ai-novel/shared/types/novelDirector";
import { buildFullDirectorAutoApprovalConfig } from "@ai-novel/shared/types/autoDirectorApproval";
import { flattenGenreTreeOptions, getGenreTree } from "@/api/genre";
import {
  confirmDirectorCandidate,
  generateDirectorCandidates,
  getDirectorCommandResult,
} from "@/api/novelDirector";
import { bootstrapNovelWorkflow } from "@/api/novelWorkflow";
import { getTaskDetail } from "@/api/tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useLLMStore } from "@/store/llmStore";

async function waitForCommandResult<T>(commandId: string): Promise<T> {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const response = await getDirectorCommandResult<T>(commandId);
    if (response.data?.result) {
      return response.data.result;
    }
    const status = response.data?.status;
    if (status === "failed" || status === "cancelled" || status === "stale") {
      throw new Error(response.data?.errorMessage || "AI 任务没有完成，请稍后重试。");
    }
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
  }
  throw new Error("AI 处理时间较长，请到运行记录查看进度。");
}

async function waitForNovelId(taskId: string): Promise<string> {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const response = await getTaskDetail("novel_workflow", taskId);
    const novelId = response.data?.resumeTarget?.novelId?.trim();
    if (novelId) {
      return novelId;
    }
    if (response.data?.status === "failed" || response.data?.status === "cancelled") {
      throw new Error("小说项目创建失败，请重试。");
    }
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
  }
  throw new Error("小说正在后台创建，可稍后从小说列表进入。");
}

function CandidateCard(props: {
  candidate: DirectorCandidate;
  index: number;
  disabled: boolean;
  onChoose: () => void;
}) {
  const { candidate, index, disabled, onChoose } = props;
  return (
    <article className="flex h-full flex-col rounded-2xl border border-border bg-background p-5 shadow-sm">
      <div className="text-xs font-medium text-muted-foreground">方向 {index + 1} · 约 {candidate.targetChapterCount} 章</div>
      <h2 className="mt-2 text-2xl font-semibold leading-9 text-foreground">{candidate.workingTitle}</h2>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">{candidate.logline}</p>
      <dl className="mt-5 flex-1 space-y-4 text-sm">
        {[
          ["题材定位", candidate.positioning],
          ["核心卖点", candidate.sellingPoint],
          ["主角设定", candidate.protagonistPath],
          ["核心冲突", candidate.coreConflict],
          ["读者爽点", candidate.hookStrategy],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
            <dd className="mt-1 leading-6 text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <Button type="button" className="mt-6 w-full justify-between" disabled={disabled} onClick={onChoose}>
        {disabled ? "正在创建整本书..." : "选这个方向，开始写整本书"}
        {!disabled ? <ArrowRight className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
      </Button>
    </article>
  );
}

export default function SimpleNovelCreatePage() {
  const navigate = useNavigate();
  const llm = useLLMStore();
  const [idea, setIdea] = useState("");
  const [chapterCount, setChapterCount] = useState(120);
  const [genreOptions, setGenreOptions] = useState<Array<{ id: string; label: string; path: string }>>([]);
  const [selectedGenreIds, setSelectedGenreIds] = useState<string[]>([]);
  const [batch, setBatch] = useState<DirectorCandidateBatch | null>(null);
  const [workflowTaskId, setWorkflowTaskId] = useState("");

  const selectedGenreLabels = useMemo(
    () => genreOptions.filter((item) => selectedGenreIds.includes(item.id)).map((item) => item.label),
    [genreOptions, selectedGenreIds],
  );

  const loadGenresMutation = useMutation({
    mutationFn: getGenreTree,
    onSuccess: (response) => setGenreOptions(flattenGenreTreeOptions(response.data ?? [])),
  });

  useEffect(() => {
    loadGenresMutation.mutate();
  }, []);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const task = await bootstrapNovelWorkflow({
        lane: "auto_director",
        seedPayload: { idea, creationExperience: "simple", genreTagIds: selectedGenreIds },
      });
      const taskId = task.data?.id;
      if (!taskId) {
        throw new Error("未能创建 AI 导演任务。");
      }
      setWorkflowTaskId(taskId);
      const accepted = await generateDirectorCandidates({
        idea: idea.trim(),
        creationExperience: "simple",
        genreTagIds: selectedGenreIds,
        commercialTags: selectedGenreLabels,
        genreId: selectedGenreIds[0],
        candidateCount: 2,
        estimatedChapterCount: chapterCount,
        projectMode: "ai_led",
        runMode: "full_book_autopilot",
        workflowTaskId: taskId,
        provider: llm.provider || undefined,
        model: llm.model || undefined,
        temperature: llm.temperature,
      });
      const commandId = accepted.data?.commandId;
      if (!commandId) {
        throw new Error("AI 没有接受方向生成任务。");
      }
      return waitForCommandResult<{ batch: DirectorCandidateBatch }>(commandId);
    },
    onSuccess: (result) => setBatch(result.batch),
    onError: (error) => toast.error(error instanceof Error ? error.message : "生成方向失败，请重试。"),
  });

  const confirmMutation = useMutation({
    mutationFn: async (candidate: DirectorCandidate) => {
      if (!batch || !workflowTaskId) {
        throw new Error("方向任务已失效，请重新生成。");
      }
      const accepted = await confirmDirectorCandidate({
        idea: idea.trim(),
        creationExperience: "simple",
        genreTagIds: selectedGenreIds,
        commercialTags: selectedGenreLabels,
        genreId: selectedGenreIds[0],
        batchId: batch.id,
        round: batch.round,
        candidate,
        workflowTaskId,
        runMode: "full_book_autopilot",
        projectMode: "ai_led",
        estimatedChapterCount: candidate.targetChapterCount || chapterCount,
        autoExecutionPlan: buildFullBookAutopilotExecutionPlan(),
        autoApproval: buildFullDirectorAutoApprovalConfig(),
        provider: llm.provider || undefined,
        model: llm.model || undefined,
        temperature: llm.temperature,
      });
      const commandId = accepted.data?.commandId;
      if (!commandId) {
        throw new Error("AI 没有接受建书任务。");
      }
      await waitForCommandResult(commandId);
      return waitForNovelId(workflowTaskId);
    },
    onSuccess: (novelId) => navigate(`/novels/${novelId}/simple`),
    onError: (error) => toast.error(error instanceof Error ? error.message : "创建整本书失败，请重试。"),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-7 px-3 py-5 sm:px-4 lg:px-0">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/novels/create"><ArrowLeft className="h-4 w-4" /> 返回创作方式</Link>
        </Button>
        <div className="mt-4 flex items-center gap-2 text-primary"><Sparkles className="h-5 w-5" /> 简易创作</div>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">
          {batch ? "从两个整书方向中选一个" : "告诉 AI 你想写什么"}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          {batch
            ? "选定后，AI 会自动完成规划、章节写作、审校与修复。你可以随时回来阅读已经完成的章节。"
            : "不需要准备大纲。写下一句话灵感，再选几个接近的题材即可。"}
        </p>
      </div>

      {!batch ? (
        <section className="space-y-6 rounded-2xl border border-border bg-background p-5 sm:p-6">
          <div>
            <label htmlFor="simple-idea" className="text-sm font-medium text-foreground">一句话灵感</label>
            <textarea
              id="simple-idea"
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
              rows={4}
              className="mt-2 w-full resize-none rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="例如：一个只能看见别人死亡倒计时的普通人，发现整座城市只剩七天。"
            />
          </div>
          <div>
            <div className="text-sm font-medium text-foreground">题材标签（可选）</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {genreOptions.slice(0, 18).map((genre) => {
                const active = selectedGenreIds.includes(genre.id);
                return (
                  <button
                    key={genre.id}
                    type="button"
                    className={`rounded-full px-3 py-1.5 text-sm transition ${active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"}`}
                    onClick={() => setSelectedGenreIds((current) => (
                      active ? current.filter((id) => id !== genre.id) : [...current, genre.id].slice(-3)
                    ))}
                  >
                    {genre.label}
                  </button>
                );
              })}
            </div>
          </div>
          <details>
            <summary className="cursor-pointer text-sm font-medium text-foreground">可选设置</summary>
            <div className="mt-3 max-w-xs">
              <label htmlFor="simple-chapter-count" className="text-xs text-muted-foreground">预计章节数</label>
              <Input
                id="simple-chapter-count"
                type="number"
                min={20}
                max={2000}
                value={chapterCount}
                onChange={(event) => setChapterCount(Math.max(20, Math.min(2000, Number(event.target.value) || 120)))}
              />
            </div>
          </details>
          <Button
            type="button"
            size="lg"
            disabled={!idea.trim() || generateMutation.isPending}
            onClick={() => generateMutation.mutate()}
          >
            {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generateMutation.isPending ? "AI 正在准备两个方向..." : "生成两个整书方向"}
          </Button>
        </section>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {batch.candidates.map((candidate, index) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              index={index}
              disabled={confirmMutation.isPending}
              onChoose={() => confirmMutation.mutate(candidate)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
