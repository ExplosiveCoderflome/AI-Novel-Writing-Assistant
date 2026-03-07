import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QualityScore, ReviewIssue } from "@ai-novel/shared/types/novel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LLMSelector from "@/components/common/LLMSelector";
import StreamOutput from "@/components/common/StreamOutput";
import KnowledgeBindingPanel from "@/components/knowledge/KnowledgeBindingPanel";
import NovelCharacterPanel from "./components/NovelCharacterPanel";
import { getBaseCharacterList } from "@/api/character";
import {
  checkCharacterAgainstWorld,
  createNovelCharacter,
  createNovelChapter,
  evolveNovelCharacter,
  generateChapterHook,
  getCharacterTimeline,
  getNovelDetail,
  getNovelPipelineJob,
  getNovelQualityReport,
  reviewNovelChapter,
  runNovelPipeline,
  syncAllCharacterTimeline,
  syncCharacterTimeline,
  updateNovel,
  updateNovelCharacter,
} from "@/api/novel";
import { getWorldList } from "@/api/world";
import { queryKeys } from "@/api/queryKeys";
import { useSSE } from "@/hooks/useSSE";
import { useLLMStore } from "@/store/llmStore";

interface StructuredVolume {
  volumeTitle: string;
  chapters: Array<{
    order: number;
    title: string;
    summary: string;
  }>;
}

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickFirstString(record: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return null;
}

function parseOrder(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const matched = value.match(/\d+/);
    if (!matched) {
      return null;
    }
    const parsed = Number.parseInt(matched[0], 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function normalizeStructuredChapter(raw: unknown, index: number): StructuredVolume["chapters"][number] | null {
  if (!isJsonRecord(raw)) {
    return null;
  }
  const order = parseOrder(raw.order ?? raw.chapterOrder ?? raw.chapterNo ?? raw.chapter ?? raw.index) ?? index + 1;
  const rawTitle = pickFirstString(raw, ["title", "chapterTitle", "name", "chapterName"]);
  const rawSummary = pickFirstString(raw, ["summary", "outline", "description", "content"]);
  if (!rawTitle && !rawSummary) {
    return null;
  }
  const title = rawTitle ?? `Chapter ${order}`;
  const summary = rawSummary ?? "";
  return { order, title, summary };
}

function normalizeStructuredVolume(raw: unknown, index: number): StructuredVolume | null {
  if (!isJsonRecord(raw)) {
    return null;
  }
  const volumeTitle = pickFirstString(raw, ["volumeTitle", "title", "name", "volume", "arcTitle"]) ?? `Volume ${index + 1}`;
  const rawChapters =
    (Array.isArray(raw.chapters) && raw.chapters)
    || (Array.isArray(raw.chapterList) && raw.chapterList)
    || (Array.isArray(raw.items) && raw.items)
    || (Array.isArray(raw.sections) && raw.sections)
    || [];
  const chapters = rawChapters
    .map((chapter, chapterIndex) => normalizeStructuredChapter(chapter, chapterIndex))
    .filter((chapter): chapter is StructuredVolume["chapters"][number] => chapter !== null);
  if (chapters.length === 0) {
    return null;
  }
  return { volumeTitle, chapters };
}

function parseStructuredVolumes(raw: string | null | undefined): StructuredVolume[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    const volumeLikeList = Array.isArray(parsed)
      ? parsed
      : isJsonRecord(parsed) && Array.isArray(parsed.volumes)
        ? parsed.volumes
        : isJsonRecord(parsed) && Array.isArray(parsed.items)
          ? parsed.items
          : [];
    if (volumeLikeList.length === 0) {
      return [];
    }
    const normalizedVolumes = volumeLikeList
      .map((volume, volumeIndex) => normalizeStructuredVolume(volume, volumeIndex))
      .filter((volume): volume is StructuredVolume => volume !== null);
    if (normalizedVolumes.length > 0) {
      return normalizedVolumes;
    }
    const chapters = volumeLikeList
      .map((chapter, chapterIndex) => normalizeStructuredChapter(chapter, chapterIndex))
      .filter((chapter): chapter is StructuredVolume["chapters"][number] => chapter !== null);
    if (chapters.length === 0) {
      return [];
    }
    return [{ volumeTitle: "Volume 1", chapters }];
  } catch {
    return [];
  }
}

export default function NovelEdit() {
  const { id = "" } = useParams();
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("basic");
  const [basicForm, setBasicForm] = useState({
    title: "",
    description: "",
    worldId: "",
    status: "draft" as "draft" | "published",
  });
  const [outlineText, setOutlineText] = useState("");
  const [currentJobId, setCurrentJobId] = useState("");
  const [pipelineForm, setPipelineForm] = useState({
    startOrder: 1,
    endOrder: 10,
    maxRetries: 2,
  });
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [reviewResult, setReviewResult] = useState<{
    score: QualityScore;
    issues: ReviewIssue[];
  } | null>(null);
  const [pipelineMessage, setPipelineMessage] = useState("");
  const [characterMessage, setCharacterMessage] = useState("");
  const [repairBeforeContent, setRepairBeforeContent] = useState("");
  const [repairAfterContent, setRepairAfterContent] = useState("");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [selectedBaseCharacterId, setSelectedBaseCharacterId] = useState("");
  const [quickCharacterForm, setQuickCharacterForm] = useState({
    name: "",
    role: "主角",
  });
  const [characterForm, setCharacterForm] = useState({
    personality: "",
    background: "",
    development: "",
    currentState: "",
    currentGoal: "",
  });

  const novelDetailQuery = useQuery({
    queryKey: queryKeys.novels.detail(id),
    queryFn: () => getNovelDetail(id),
    enabled: Boolean(id),
  });

  const qualityReportQuery = useQuery({
    queryKey: queryKeys.novels.qualityReport(id),
    queryFn: () => getNovelQualityReport(id),
    enabled: Boolean(id),
  });

  const baseCharacterListQuery = useQuery({
    queryKey: queryKeys.baseCharacters.all,
    queryFn: () => getBaseCharacterList(),
  });

  const worldListQuery = useQuery({
    queryKey: queryKeys.worlds.all,
    queryFn: getWorldList,
  });

  const pipelineJobQuery = useQuery({
    queryKey: queryKeys.novels.pipelineJob(id, currentJobId || "none"),
    queryFn: () => getNovelPipelineJob(id, currentJobId),
    enabled: Boolean(id && currentJobId),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      if (status === "queued" || status === "running") {
        return 1500;
      }
      return false;
    },
  });

  const structuredVolumes = useMemo<StructuredVolume[]>(
    () => parseStructuredVolumes(novelDetailQuery.data?.data?.structuredOutline),
    [novelDetailQuery.data?.data?.structuredOutline],
  );

  const chapters = useMemo(() => novelDetailQuery.data?.data?.chapters ?? [], [novelDetailQuery.data?.data?.chapters]);
  const selectedChapter = useMemo(
    () => chapters.find((item) => item.id === selectedChapterId),
    [chapters, selectedChapterId],
  );
  const characters = novelDetailQuery.data?.data?.characters ?? [];
  const baseCharacters = baseCharacterListQuery.data?.data ?? [];
  const selectedCharacter = useMemo(
    () => characters.find((item) => item.id === selectedCharacterId),
    [characters, selectedCharacterId],
  );
  const selectedBaseCharacter = useMemo(
    () => baseCharacters.find((item) => item.id === selectedBaseCharacterId),
    [baseCharacters, selectedBaseCharacterId],
  );
  const importedBaseCharacterIds = useMemo(
    () => new Set(
      characters
        .map((item) => item.baseCharacterId)
        .filter((item): item is string => Boolean(item)),
    ),
    [characters],
  );
  const hasCharacters = characters.length > 0;
  const coreCharacterCount = useMemo(
    () => characters.filter((item) => /主角|反派/.test(item.role)).length,
    [characters],
  );
  const bible = novelDetailQuery.data?.data?.bible;
  const plotBeats = novelDetailQuery.data?.data?.plotBeats ?? [];
  const maxOrder = useMemo(
    () => chapters.reduce((max, chapter) => Math.max(max, chapter.order), 1),
    [chapters],
  );

  useEffect(() => {
    const detail = novelDetailQuery.data?.data;
    if (!detail) {
      return;
    }
    setBasicForm({
      title: detail.title,
      description: detail.description ?? "",
      worldId: detail.worldId ?? "",
      status: detail.status,
    });
    setOutlineText(detail.outline ?? "");
    setPipelineForm((prev) => ({
      ...prev,
      endOrder: Math.max(prev.endOrder, Math.max(10, detail.chapters.length || 10)),
    }));
  }, [novelDetailQuery.data?.data]);

  useEffect(() => {
    if (!selectedChapterId && chapters.length > 0) {
      setSelectedChapterId(chapters[0].id);
    }
  }, [chapters, selectedChapterId]);

  useEffect(() => {
    if (!selectedCharacterId && characters.length > 0) {
      setSelectedCharacterId(characters[0].id);
    }
  }, [characters, selectedCharacterId]);

  useEffect(() => {
    if (!selectedBaseCharacterId && baseCharacters.length > 0) {
      setSelectedBaseCharacterId(baseCharacters[0].id);
    }
  }, [baseCharacters, selectedBaseCharacterId]);

  useEffect(() => {
    if (!selectedCharacter) {
      setCharacterForm({
        personality: "",
        background: "",
        development: "",
        currentState: "",
        currentGoal: "",
      });
      return;
    }
    setCharacterForm({
      personality: selectedCharacter.personality ?? "",
      background: selectedCharacter.background ?? "",
      development: selectedCharacter.development ?? "",
      currentState: selectedCharacter.currentState ?? "",
      currentGoal: selectedCharacter.currentGoal ?? "",
    });
  }, [selectedCharacter]);

  const invalidateNovelDetail = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.qualityReport(id) });
  };

  const saveBasicMutation = useMutation({
    mutationFn: () =>
      updateNovel(id, {
        title: basicForm.title,
        description: basicForm.description,
        worldId: basicForm.worldId || null,
        status: basicForm.status,
      }),
    onSuccess: async () => {
      await invalidateNovelDetail();
      if (!hasCharacters) {
        setActiveTab("character");
      }
    },
  });

  const saveOutlineMutation = useMutation({
    mutationFn: () => updateNovel(id, { outline: outlineText }),
    onSuccess: invalidateNovelDetail,
  });

  const batchCreateMutation = useMutation({
    mutationFn: async () => {
      const volumes = structuredVolumes;
      if (volumes.length === 0) {
        return;
      }
      const chapterList = volumes.flatMap((volume) => volume.chapters ?? []);
      await Promise.all(
        chapterList.map((chapter) =>
          createNovelChapter(id, {
            title: chapter.title,
            order: chapter.order,
            content: "",
            expectation: chapter.summary,
          })),
      );
    },
    onSuccess: invalidateNovelDetail,
  });

  const createChapterMutation = useMutation({
    mutationFn: () =>
      createNovelChapter(id, {
        title: `新章节 ${((novelDetailQuery.data?.data?.chapters?.length ?? 0) + 1).toString()}`,
        order: (novelDetailQuery.data?.data?.chapters?.length ?? 0) + 1,
        content: "",
      }),
    onSuccess: invalidateNovelDetail,
  });

  const runPipelineMutation = useMutation({
    mutationFn: () =>
      runNovelPipeline(id, {
        startOrder: pipelineForm.startOrder,
        endOrder: pipelineForm.endOrder,
        maxRetries: pipelineForm.maxRetries,
        provider: llm.provider,
        model: llm.model,
        temperature: llm.temperature,
      }),
    onSuccess: async (response) => {
      if (response.data?.id) {
        setCurrentJobId(response.data.id);
      }
      setPipelineMessage(response.message ?? "批量任务已启动。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.pipelineJob(id, response.data?.id ?? "none") });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: () =>
      reviewNovelChapter(id, selectedChapterId, {
        provider: llm.provider,
        model: llm.model,
        temperature: 0.1,
      }),
    onSuccess: async (response) => {
      setReviewResult(response.data ?? null);
      setPipelineMessage("章节审校完成。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.qualityReport(id) });
    },
  });

  const hookMutation = useMutation({
    mutationFn: () =>
      generateChapterHook(id, {
        chapterId: selectedChapterId || undefined,
        provider: llm.provider,
        model: llm.model,
        temperature: llm.temperature,
      }),
    onSuccess: async () => {
      setPipelineMessage("章节钩子已生成。");
      await invalidateNovelDetail();
    },
  });

  const characterTimelineQuery = useQuery({
    queryKey: queryKeys.novels.characterTimeline(id, selectedCharacterId || "none"),
    queryFn: () => getCharacterTimeline(id, selectedCharacterId),
    enabled: Boolean(id && selectedCharacterId),
  });

  const syncTimelineMutation = useMutation({
    mutationFn: () =>
      syncCharacterTimeline(id, selectedCharacterId, {
        startOrder: pipelineForm.startOrder,
        endOrder: pipelineForm.endOrder,
      }),
    onSuccess: async (response) => {
      setCharacterMessage(
        response.message
        ?? `角色时间线同步完成，本次新增 ${response.data?.syncedCount ?? 0} 条。`,
      );
      await queryClient.invalidateQueries({
        queryKey: queryKeys.novels.characterTimeline(id, selectedCharacterId || "none"),
      });
    },
  });

  const syncAllTimelineMutation = useMutation({
    mutationFn: () =>
      syncAllCharacterTimeline(id, {
        startOrder: pipelineForm.startOrder,
        endOrder: pipelineForm.endOrder,
      }),
    onSuccess: async (response) => {
      setCharacterMessage(
        response.message
        ?? `全角色时间线同步完成，共新增 ${response.data?.syncedCount ?? 0} 条事件。`,
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.novels.characterTimeline(id, selectedCharacterId || "none"),
      });
    },
  });

  const evolveCharacterMutation = useMutation({
    mutationFn: () =>
      evolveNovelCharacter(id, selectedCharacterId, {
        provider: llm.provider,
        model: llm.model,
        temperature: 0.4,
      }),
    onSuccess: async () => {
      setCharacterMessage("角色信息已按时间线完成演进更新。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.novels.characterTimeline(id, selectedCharacterId || "none"),
      });
    },
  });

  const worldCheckMutation = useMutation({
    mutationFn: () =>
      checkCharacterAgainstWorld(id, selectedCharacterId, {
        provider: llm.provider,
        model: llm.model,
        temperature: 0.2,
      }),
    onSuccess: (response) => {
      const status = response.data?.status ?? "pass";
      const warningText = response.data?.warnings?.join(" | ") ?? "";
      const issueText = (response.data?.issues ?? [])
        .map((item) => `${item.severity.toUpperCase()}: ${item.message}`)
        .join(" | ");
      setCharacterMessage(`世界规则检查(${status}) ${warningText} ${issueText}`.trim());
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "世界规则检查失败。";
      setCharacterMessage(message);
    },
  });

  const saveCharacterMutation = useMutation({
    mutationFn: () =>
      updateNovelCharacter(id, selectedCharacterId, {
        personality: characterForm.personality,
        background: characterForm.background,
        development: characterForm.development,
        currentState: characterForm.currentState,
        currentGoal: characterForm.currentGoal,
      }),
    onSuccess: async () => {
      setCharacterMessage("角色信息已保存。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) });
    },
  });

  const importBaseCharacterMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBaseCharacter) {
        throw new Error("请先选择要导入的基础角色。");
      }
      return createNovelCharacter(id, {
        name: selectedBaseCharacter.name,
        role: selectedBaseCharacter.role,
        personality: selectedBaseCharacter.personality,
        background: selectedBaseCharacter.background,
        development: selectedBaseCharacter.development,
        baseCharacterId: selectedBaseCharacter.id,
      });
    },
    onSuccess: async (response) => {
      setCharacterMessage(response.message ?? "基础角色已导入到当前小说。");
      if (response.data?.id) {
        setSelectedCharacterId(response.data.id);
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "导入基础角色失败。";
      setCharacterMessage(message);
    },
  });

  const quickCreateCharacterMutation = useMutation({
    mutationFn: async () =>
      createNovelCharacter(id, {
        name: quickCharacterForm.name.trim(),
        role: quickCharacterForm.role.trim() || "主角",
      }),
    onSuccess: async (response) => {
      setCharacterMessage(response.message ?? "角色创建成功。");
      setQuickCharacterForm({ name: "", role: quickCharacterForm.role || "主角" });
      if (response.data?.id) {
        setSelectedCharacterId(response.data.id);
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "角色创建失败。";
      setCharacterMessage(message);
    },
  });

  const goToCharacterTab = () => {
    setActiveTab("character");
  };

  const startOutlineGeneration = () => {
    if (!hasCharacters) {
      const confirmed = window.confirm("当前小说还没有角色。继续生成发展走向会降低后续一致性，是否继续？");
      if (!confirmed) {
        return;
      }
    }
    void outlineSSE.start(`/novels/${id}/outline/generate`, {
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
    });
  };

  const outlineSSE = useSSE({ onDone: (fullContent) => setOutlineText(fullContent) });
  const structuredSSE = useSSE({ onDone: invalidateNovelDetail });
  const chapterSSE = useSSE({ onDone: invalidateNovelDetail });
  const bibleSSE = useSSE({ onDone: invalidateNovelDetail });
  const beatsSSE = useSSE({ onDone: invalidateNovelDetail });
  const repairSSE = useSSE({
    onDone: async (fullContent) => {
      setRepairAfterContent(fullContent);
      await invalidateNovelDetail();
    },
  });

  const qualitySummary = qualityReportQuery.data?.data?.summary;
  const worldInjectionSummary = useMemo(() => {
    const world = novelDetailQuery.data?.data?.world;
    if (!world) {
      return null;
    }

    let axioms: string[] = [];
    if (world.axioms?.trim()) {
      try {
        const parsed = JSON.parse(world.axioms) as string[];
        axioms = Array.isArray(parsed) ? parsed.filter((item) => item.trim()).slice(0, 3) : [];
      } catch {
        axioms = world.axioms
          .split(/[\n,，;；]/)
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 3);
      }
    }

    const summaryBlock = world.overviewSummary?.trim() || world.description?.trim() || "No summary.";
    const magicBlock = world.magicSystem?.trim() ? world.magicSystem.trim().slice(0, 120) : "";
    const conflictBlock = world.conflicts?.trim() ? world.conflicts.trim().slice(0, 120) : "";

    const lines = [
      `${world.name}${world.worldType ? ` (${world.worldType})` : ""}`,
      `Summary: ${summaryBlock}`,
      ...(axioms.length > 0 ? [`Axioms: ${axioms.join(" | ")}`] : []),
      ...(magicBlock ? [`Power: ${magicBlock}`] : []),
      ...(conflictBlock ? [`Conflict: ${conflictBlock}`] : []),
    ];
    return lines.join("\n");
  }, [novelDetailQuery.data?.data?.world]);

  const renderWorldInjectionHint = () => (
    <div className="rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-900">
      {worldInjectionSummary ? (
        <div className="space-y-1">
          <div className="font-semibold">已注入世界规则上下文</div>
          <pre className="whitespace-pre-wrap">{worldInjectionSummary}</pre>
        </div>
      ) : (
        <div>当前未绑定世界观，生成过程不会注入世界规则。</div>
      )}
    </div>
  );

  return (
    <>
      {id ? (
        <Card>
          <CardHeader>
            <CardTitle>参考知识</CardTitle>
          </CardHeader>
          <CardContent>
            <KnowledgeBindingPanel targetType="novel" targetId={id} title="小说知识绑定" />
          </CardContent>
        </Card>
      ) : null}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="basic">基本信息</TabsTrigger>
        <TabsTrigger value="character">角色管理</TabsTrigger>
        <TabsTrigger value="outline">发展走向</TabsTrigger>
        <TabsTrigger value="structured">章节大纲</TabsTrigger>
        <TabsTrigger value="chapter">章节管理</TabsTrigger>
        <TabsTrigger value="pipeline">自动流水线</TabsTrigger>
      </TabsList>

      <TabsContent value="basic">
        <Card>
          <CardHeader>
            <CardTitle>基本信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={basicForm.title} placeholder="小说标题" onChange={(event) => setBasicForm((prev) => ({ ...prev, title: event.target.value }))} />
            <Input value={basicForm.description} placeholder="小说简介" onChange={(event) => setBasicForm((prev) => ({ ...prev, description: event.target.value }))} />
            <select
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={basicForm.worldId}
              onChange={(event) => setBasicForm((prev) => ({ ...prev, worldId: event.target.value }))}
            >
              <option value="">不绑定世界观</option>
              {(worldListQuery.data?.data ?? []).map((world) => (
                <option key={world.id} value={world.id}>
                  {world.name}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <Button variant={basicForm.status === "draft" ? "default" : "secondary"} onClick={() => setBasicForm((prev) => ({ ...prev, status: "draft" }))}>草稿</Button>
              <Button variant={basicForm.status === "published" ? "default" : "secondary"} onClick={() => setBasicForm((prev) => ({ ...prev, status: "published" }))}>已发布</Button>
            </div>
            <Button onClick={() => saveBasicMutation.mutate()} disabled={saveBasicMutation.isPending}>{saveBasicMutation.isPending ? "保存中..." : "保存基本信息"}</Button>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="outline">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>小说发展走向</CardTitle>
            <LLMSelector />
          </CardHeader>
          <CardContent className="space-y-3">
            {renderWorldInjectionHint()}
            {!hasCharacters ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                <span>建议先为本小说添加至少 1 个角色，再生成发展走向。</span>
                <Button size="sm" variant="outline" onClick={goToCharacterTab}>去角色管理</Button>
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button onClick={startOutlineGeneration} disabled={outlineSSE.isStreaming}>生成发展走向</Button>
              <Button variant="secondary" onClick={outlineSSE.abort} disabled={!outlineSSE.isStreaming}>停止生成</Button>
            </div>
            <StreamOutput isStreaming={outlineSSE.isStreaming} content={outlineSSE.content} onAbort={outlineSSE.abort} />
            <textarea className="min-h-[260px] w-full rounded-md border bg-background p-3 text-sm" value={outlineText} onChange={(event) => setOutlineText(event.target.value)} />
            <Button onClick={() => saveOutlineMutation.mutate()} disabled={saveOutlineMutation.isPending}>{saveOutlineMutation.isPending ? "保存中..." : "保存发展走向"}</Button>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="structured">
        <Card>
          <CardHeader><CardTitle>结构化章节大纲</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {renderWorldInjectionHint()}
            {!hasCharacters ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                <span>请先添加至少 1 个角色，再生成结构化章节大纲。</span>
                <Button size="sm" variant="outline" onClick={goToCharacterTab}>去角色管理</Button>
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button
                onClick={() => void structuredSSE.start(`/novels/${id}/structured-outline/generate`, { provider: llm.provider, model: llm.model })}
                disabled={structuredSSE.isStreaming || !hasCharacters}
              >
                生成结构化大纲
              </Button>
              <Button variant="secondary" onClick={structuredSSE.abort} disabled={!structuredSSE.isStreaming}>停止生成</Button>
              <Button variant="outline" onClick={() => batchCreateMutation.mutate()} disabled={batchCreateMutation.isPending || !hasCharacters || structuredVolumes.length === 0}>{batchCreateMutation.isPending ? "同步中..." : "重新同步章节"}</Button>
            </div>
            <StreamOutput isStreaming={structuredSSE.isStreaming} content={structuredSSE.content} onAbort={structuredSSE.abort} />
            <div className="space-y-2">
              {structuredVolumes.length === 0 ? <div className="text-sm text-muted-foreground">暂无结构化大纲。</div> : structuredVolumes.map((volume, volumeIndex) => (
                <div key={`${volume.volumeTitle}-${volumeIndex}`} className="rounded-md border p-3">
                  <div className="mb-2 font-semibold">{volume.volumeTitle}</div>
                  <div className="space-y-1 text-sm">
                    {(volume.chapters ?? []).map((chapter, chapterIndex) => (
                      <div key={`${volume.volumeTitle}-${chapter.order}-${chapterIndex}`}>第{chapter.order}章：{chapter.title} - {chapter.summary}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="chapter">
        <Card>
          <CardHeader><CardTitle>章节管理</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {renderWorldInjectionHint()}
            {!hasCharacters ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                <span>请先添加至少 1 个角色，再生成章节内容。</span>
                <Button size="sm" variant="outline" onClick={goToCharacterTab}>去角色管理</Button>
              </div>
            ) : null}
            <div className="mb-2 flex justify-end">
              <Button onClick={() => createChapterMutation.mutate()} disabled={createChapterMutation.isPending}>{createChapterMutation.isPending ? "创建中..." : "新建章节"}</Button>
            </div>
            {(novelDetailQuery.data?.data?.chapters ?? []).map((chapter) => (
              <div key={chapter.id} className="flex items-center justify-between rounded-md border p-3">
                <div className="flex-1 min-w-0 pr-3">
                  <div className="font-medium">第 {chapter.order} 章：{chapter.title}</div>
                  {chapter.expectation && (
                    <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{chapter.expectation}</div>
                  )}
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>字数：{chapter.content?.length ?? 0}</span>
                    {(chapter as ChapterWithState).generationState ? <Badge variant="outline">{(chapter as ChapterWithState).generationState}</Badge> : null}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button asChild size="sm"><Link to={`/novels/${id}/chapters/${chapter.id}`}>编辑章节</Link></Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void chapterSSE.start(`/novels/${id}/chapters/${chapter.id}/generate`, { provider: llm.provider, model: llm.model, previousChaptersSummary: [] })}
                    disabled={!hasCharacters}
                  >
                    生成内容
                  </Button>
                </div>
              </div>
            ))}
            <StreamOutput content={chapterSSE.content} isStreaming={chapterSSE.isStreaming} onAbort={chapterSSE.abort} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="pipeline">
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>流水线与质量控制</CardTitle>
            <LLMSelector />
          </CardHeader>
          <CardContent className="space-y-3">
            {renderWorldInjectionHint()}
            {!hasCharacters ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                  <span>请先添加至少 1 个角色，再执行圣经/拍点/批量章节流水线。</span>
                  <Button size="sm" variant="outline" onClick={goToCharacterTab}>去角色管理</Button>
                </div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">起始章节序号</div>
                  <Input
                    type="number"
                    min={1}
                    max={maxOrder}
                    value={pipelineForm.startOrder}
                    onChange={(event) =>
                      setPipelineForm((prev) => ({ ...prev, startOrder: Number(event.target.value) || 1 }))
                    }
                    placeholder="例如：1"
                  />
                  <div className="text-xs text-muted-foreground">从第几章开始纳入本次批量生成。</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">结束章节序号</div>
                  <Input
                    type="number"
                    min={1}
                    max={maxOrder}
                    value={pipelineForm.endOrder}
                    onChange={(event) =>
                      setPipelineForm((prev) => ({ ...prev, endOrder: Number(event.target.value) || 1 }))
                    }
                    placeholder="例如：10"
                  />
                  <div className="text-xs text-muted-foreground">到第几章结束（包含该章节）。</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">失败重试次数</div>
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    value={pipelineForm.maxRetries}
                    onChange={(event) =>
                      setPipelineForm((prev) => ({ ...prev, maxRetries: Number(event.target.value) || 0 }))
                    }
                    placeholder="例如：2"
                  />
                  <div className="text-xs text-muted-foreground">单章不达标时，最多自动修复重跑几次。</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void bibleSSE.start(`/novels/${id}/bible/generate`, { provider: llm.provider, model: llm.model, temperature: 0.6 })} disabled={bibleSSE.isStreaming || !hasCharacters}>生成/更新作品圣经</Button>
                <Button variant="secondary" onClick={bibleSSE.abort} disabled={!bibleSSE.isStreaming}>停止圣经生成</Button>
                <Button onClick={() => void beatsSSE.start(`/novels/${id}/beats/generate`, { provider: llm.provider, model: llm.model, targetChapters: pipelineForm.endOrder })} disabled={beatsSSE.isStreaming || !hasCharacters}>生成剧情拍点</Button>
                <Button variant="secondary" onClick={beatsSSE.abort} disabled={!beatsSSE.isStreaming}>停止拍点生成</Button>
                <Button onClick={() => runPipelineMutation.mutate()} disabled={runPipelineMutation.isPending || !hasCharacters}>启动批量章节流水线</Button>
              </div>
              {pipelineMessage ? <div className="text-sm text-muted-foreground">{pipelineMessage}</div> : null}
              <div className="rounded-md border p-3 text-sm">
                <div className="mb-2 font-medium">任务状态</div>
                {pipelineJobQuery.data?.data ? (
                  <div className="space-y-1">
                    <div>任务ID：{pipelineJobQuery.data.data.id}</div>
                    <div>状态：{pipelineJobQuery.data.data.status}</div>
                    <div>进度：{Math.round((pipelineJobQuery.data.data.progress ?? 0) * 100)}%</div>
                    <div>完成章节：{pipelineJobQuery.data.data.completedCount}/{pipelineJobQuery.data.data.totalCount}</div>
                    <div>重试次数：{pipelineJobQuery.data.data.retryCount}/{pipelineJobQuery.data.data.maxRetries}</div>
                    {pipelineJobQuery.data.data.error ? <div className="text-red-600">错误：{pipelineJobQuery.data.data.error}</div> : null}
                  </div>
                ) : (
                  <div className="text-muted-foreground">暂无运行中的流水线任务。</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>章节审校与修复</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <select className="w-full rounded-md border bg-background p-2 text-sm" value={selectedChapterId} onChange={(event) => setSelectedChapterId(event.target.value)}>
                {chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>第{chapter.order}章 - {chapter.title}</option>)}
              </select>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => reviewMutation.mutate()} disabled={reviewMutation.isPending || !selectedChapterId}>执行章节审校</Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setRepairBeforeContent(selectedChapter?.content ?? "");
                    setRepairAfterContent("");
                    void repairSSE.start(`/novels/${id}/chapters/${selectedChapterId}/repair`, {
                      provider: llm.provider,
                      model: llm.model,
                      reviewIssues: reviewResult?.issues ?? [],
                    });
                  }}
                  disabled={repairSSE.isStreaming || !selectedChapterId}
                >
                  按审校结果修复
                </Button>
                <Button variant="outline" onClick={() => hookMutation.mutate()} disabled={hookMutation.isPending || !selectedChapterId}>生成章节末钩子</Button>
              </div>
              {reviewResult ? (
                <div className="rounded-md border p-3 text-sm">
                  <div className="mb-2 font-medium">审校评分</div>
                  <div className="grid gap-1 md:grid-cols-3">
                    <div>连贯性：{reviewResult.score.coherence}</div>
                    <div>重复率：{reviewResult.score.repetition}</div>
                    <div>节奏：{reviewResult.score.pacing}</div>
                    <div>口吻：{reviewResult.score.voice}</div>
                    <div>追更感：{reviewResult.score.engagement}</div>
                    <div>综合：{reviewResult.score.overall}</div>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    问题数：{reviewResult.issues.length}
                  </div>
                </div>
              ) : null}
              <StreamOutput content={repairSSE.content} isStreaming={repairSSE.isStreaming} onAbort={repairSSE.abort} />
              {(repairBeforeContent || repairAfterContent) ? (
                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">修复前后对比</div>
                    <div className="text-xs text-muted-foreground">
                      修复前：{repairBeforeContent.length} 字 | 修复后：{repairAfterContent.length} 字
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">修复前</div>
                      <pre className="max-h-[280px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-2 text-xs">
                        {repairBeforeContent || "暂无"}
                      </pre>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">修复后</div>
                      <pre className="max-h-[280px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-2 text-xs">
                        {repairAfterContent || "修复执行后将显示结果"}
                      </pre>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>质量报告</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {qualitySummary ? (
                <div className="grid gap-2 md:grid-cols-3">
                  <Badge variant="outline">连贯性：{qualitySummary.coherence}</Badge>
                  <Badge variant="outline">重复率：{qualitySummary.repetition}</Badge>
                  <Badge variant="outline">节奏：{qualitySummary.pacing}</Badge>
                  <Badge variant="outline">口吻：{qualitySummary.voice}</Badge>
                  <Badge variant="outline">追更感：{qualitySummary.engagement}</Badge>
                  <Badge variant="default">综合：{qualitySummary.overall}</Badge>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">暂无质量报告。</div>
              )}
              <div className="space-y-2 text-sm">
                {(qualityReportQuery.data?.data?.chapterReports ?? []).slice(0, 8).map((item, index) => (
                  <div key={`${item.chapterId ?? "novel"}-${index}`} className="rounded-md border p-2">
                    <div>章节：{item.chapterId ?? "全书"}</div>
                    <div className="text-muted-foreground">综合分：{item.overall}，连贯性：{item.coherence}，重复率：{item.repetition}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>流式输出调试区</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-2 text-sm font-medium">作品圣经输出</div>
                  <StreamOutput content={bibleSSE.content} isStreaming={bibleSSE.isStreaming} onAbort={bibleSSE.abort} />
                </div>
                <div>
                  <div className="mb-2 text-sm font-medium">剧情拍点输出</div>
                  <StreamOutput content={beatsSSE.content} isStreaming={beatsSSE.isStreaming} onAbort={beatsSSE.abort} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>已保存的作品圣经</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {bible ? (
                <div className="space-y-2">
                  <div className="rounded-md border p-2 whitespace-pre-wrap">
                    <div className="font-medium">主线承诺</div>
                    <div className="text-muted-foreground">{bible.mainPromise ?? "暂无"}</div>
                  </div>
                  <div className="rounded-md border p-2 whitespace-pre-wrap">
                    <div className="font-medium">核心设定</div>
                    <div className="text-muted-foreground">{bible.coreSetting ?? "暂无"}</div>
                  </div>
                  <div className="rounded-md border p-2 whitespace-pre-wrap">
                    <div className="font-medium">禁止冲突规则</div>
                    <div className="text-muted-foreground">{bible.forbiddenRules ?? "暂无"}</div>
                  </div>
                  <div className="rounded-md border p-2 whitespace-pre-wrap">
                    <div className="font-medium">角色成长弧</div>
                    <div className="text-muted-foreground">{bible.characterArcs ?? "暂无"}</div>
                  </div>
                  <div className="rounded-md border p-2 whitespace-pre-wrap">
                    <div className="font-medium">世界规则</div>
                    <div className="text-muted-foreground">{bible.worldRules ?? "暂无"}</div>
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground">暂无已保存的作品圣经。请先点击“生成/更新作品圣经”。</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>已保存的剧情拍点</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {plotBeats.length > 0 ? (
                plotBeats.slice(0, 30).map((beat) => (
                  <div key={beat.id} className="rounded-md border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">
                        第 {beat.chapterOrder ?? "-"} 章 · {beat.title}
                      </div>
                      <Badge variant="outline">{beat.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">类型：{beat.beatType}</div>
                    <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{beat.content}</div>
                  </div>
                ))
              ) : (
                <div className="text-muted-foreground">暂无已保存的剧情拍点。请先点击“生成剧情拍点”。</div>
              )}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="character">
        <NovelCharacterPanel
          characterMessage={characterMessage}
          quickCharacterForm={quickCharacterForm}
          onQuickCharacterFormChange={(field, value) =>
            setQuickCharacterForm((prev) => ({ ...prev, [field]: value }))
          }
          onQuickCreateCharacter={() => quickCreateCharacterMutation.mutate()}
          isQuickCreating={quickCreateCharacterMutation.isPending}
          characters={characters}
          coreCharacterCount={coreCharacterCount}
          baseCharacters={baseCharacters}
          selectedBaseCharacterId={selectedBaseCharacterId}
          onSelectedBaseCharacterChange={setSelectedBaseCharacterId}
          selectedBaseCharacter={selectedBaseCharacter}
          importedBaseCharacterIds={importedBaseCharacterIds}
          onImportBaseCharacter={() => importBaseCharacterMutation.mutate()}
          isImportingBaseCharacter={importBaseCharacterMutation.isPending}
          selectedCharacterId={selectedCharacterId}
          onSelectedCharacterChange={setSelectedCharacterId}
          onSyncTimeline={() => syncTimelineMutation.mutate()}
          isSyncingTimeline={syncTimelineMutation.isPending}
          onSyncAllTimeline={() => syncAllTimelineMutation.mutate()}
          isSyncingAllTimeline={syncAllTimelineMutation.isPending}
          onEvolveCharacter={() => evolveCharacterMutation.mutate()}
          isEvolvingCharacter={evolveCharacterMutation.isPending}
          onWorldCheck={() => worldCheckMutation.mutate()}
          isCheckingWorld={worldCheckMutation.isPending}
          selectedCharacter={selectedCharacter}
          characterForm={characterForm}
          onCharacterFormChange={(field, value) =>
            setCharacterForm((prev) => ({ ...prev, [field]: value }))
          }
          onSaveCharacter={() => saveCharacterMutation.mutate()}
          isSavingCharacter={saveCharacterMutation.isPending}
          timelineEvents={characterTimelineQuery.data?.data ?? []}
        />
      </TabsContent>
      </Tabs>
    </>
  );
}

interface ChapterWithState {
  generationState?: string;
}
