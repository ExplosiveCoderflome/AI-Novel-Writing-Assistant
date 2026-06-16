import { useMemo, useState } from "react";

const LOCKED_FIELD_LABELS: Record<string, string> = {
  outputSchema: "输出格式",
  postValidate: "输出校验",
  postValidateFailureRecovery: "校验失败恢复",
  semanticRetryPolicy: "语义重试策略",
  taskType: "任务类型",
  mode: "输出模式",
  contextPolicy: "上下文策略",
  toolCatalog: "工具目录",
  approvalBoundary: "审批边界",
};

const SLOT_KIND_LABELS: Record<string, string> = {
  replace: "改写",
  append: "追加约束",
  choice: "选项",
  toggle: "开关",
  token: "内联值",
};

const CONTEXT_GROUP_LABELS: Record<string, string> = {
  book_contract: "全书合约",
  chapter_boundary: "章节边界",
  chapter_mission: "本章任务",
  character_dynamics: "角色关系动态",
  character_hard_facts: "角色硬事实",
  character_resource_context: "角色资源状态",
  continuation_constraints: "续写约束",
  custom_slot: "自定义约束",
  historical_issues: "历史审校问题",
  incremental_round_context: "增量生成轮次",
  local_state: "当前局面",
  narrative_progress_hint: "叙事进度提示",
  obligation_contract: "义务合约",
  open_conflicts: "开放冲突",
  opening_constraints: "开篇约束",
  participant_subset: "参与角色",
  payoff_directives: "伏笔操作指令",
  payoff_ledger: "伏笔台账",
  previous_chapter_hook: "上章钩子",
  previous_chapter_tail: "上章结尾",
  rag_context: "检索补充",
  recent_chapters: "近期章节摘要",
  repair_boundaries: "修文范围约束",
  repair_issues: "修文问题清单",
  state_goal: "状态与目标",
  story_macro: "宏观故事架构",
  structure_obligations: "结构义务",
  style_contract: "风格合约",
  timeline_context: "时间线",
  volume_window: "卷级进度",
  world_rules: "世界规则",
  world_slice: "世界片段",
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  novel: "小说",
  chapter: "章节",
  plan: "计划",
  state: "状态",
  character: "角色",
  world: "世界设定",
  style: "风格",
  audit: "审校",
  task: "任务",
};

const MESSAGE_ROLE_LABELS: Record<string, string> = {
  system: "系统",
  human: "用户",
  assistant: "模型",
  ai: "模型",
};

const TASK_TYPE_LABELS: Record<string, string> = {
  writer: "写作",
  light_review: "轻审校",
  critical_review: "完整审校",
  repair: "修文",
  summary: "摘要",
  planning: "规划",
  translation: "翻译",
  analysis: "分析",
  classification: "分类",
};

const OUTPUT_TYPE_LABELS: Record<string, string> = {
  structured: "结构化输出",
  text: "文本输出",
};
import type { ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Braces, Eye, LockKeyhole, RefreshCw, Search, ShieldCheck } from "lucide-react";
import {
  exportNovelPromptMaterials,
  getPromptCatalog,
  previewPrompt,
  type NovelMaterialBlock,
  type NovelMaterialImportance,
  type PromptCatalogItem,
  type PromptPreviewResult,
} from "@/api/promptWorkbench";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PromptSlotPanel } from "./components/PromptSlotPanel";

const ENTRYPOINT_OPTIONS = [
  { value: "creative_hub", label: "创作中枢" },
  { value: "auto_director", label: "自动导演" },
  { value: "chapter_pipeline", label: "章节流水线" },
  { value: "manual_test", label: "手动测试" },
];

const MANAGEMENT_STATUS_LABELS: Record<PromptCatalogItem["managementStatus"], string> = {
  complete: "元数据完整",
  missing_context_requirements: "缺上下文需求",
  missing_slots: "缺槽位声明",
};

const MATERIAL_IMPORTANCE_LABELS: Record<NovelMaterialImportance, string> = {
  must: "必需",
  high: "重要",
  medium: "辅助",
  low: "参考",
};

function buildPreviewPromptInput(prompt: PromptCatalogItem): Record<string, unknown> {
  const base = {
    goal: "查看提示词预览",
    messages: [],
    contextMode: "novel",
    novelId: "novel-1",
    chapterTitle: "示例章节",
    chapterMission: "让主角发现关键线索。",
  };

  if (prompt.id === "novel.chapter_editor.workspace_diagnosis") {
    return {
      chapterTitle: "示例章节",
      chapterMission: "让主角发现关键线索。",
      volumePositionLabel: "第一卷中段",
      volumePhaseLabel: "冲突展开",
      paceDirective: "加快推进",
      previousChapterBridge: "上一章留下追踪线索。",
      nextChapterBridge: "下一章进入正面对抗。",
      activePlotThreads: ["追踪档案站"],
      paragraphs: [{ index: 1, text: "主角走进旧仓库。" }],
      openIssues: [],
    };
  }

  return base;
}

function statusBadgeVariant(status: PromptCatalogItem["managementStatus"]) {
  return status === "complete" ? "default" : "secondary";
}

function capabilityLabels(prompt: PromptCatalogItem): string[] {
  return [
    prompt.capabilities.hasOutputSchema ? "Schema" : null,
    prompt.capabilities.hasPostValidate ? "PostValidate" : null,
    prompt.capabilities.hasSemanticRetryPolicy ? "SemanticRetry" : null,
    prompt.capabilities.hasRepairPolicy ? "Repair" : null,
    prompt.capabilities.hasStructuredOutputHint ? "OutputHint" : null,
  ].filter(Boolean) as string[];
}

function PromptListItem({
  prompt,
  active,
  onSelect,
}: {
  prompt: PromptCatalogItem;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-md border px-3 py-3 text-left transition-colors",
        active ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-muted/60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {prompt.description || prompt.id}
          </div>
          <div className="mt-1 font-mono text-xs text-muted-foreground/70">{prompt.id}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {prompt.version} · {TASK_TYPE_LABELS[prompt.taskType] ?? prompt.taskType} · {OUTPUT_TYPE_LABELS[prompt.mode] ?? prompt.mode}
          </div>
        </div>
        <Badge
          variant={prompt.slotSupported ? "default" : statusBadgeVariant(prompt.managementStatus)}
          className="shrink-0"
        >
          {prompt.slotSupported ? "可定制" : MANAGEMENT_STATUS_LABELS[prompt.managementStatus]}
        </Badge>
      </div>
    </button>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-relaxed text-slate-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function MaterialBlockCard({ block }: { block: NovelMaterialBlock }) {
  return (
    <div className="rounded-md border">
      <div className="flex flex-col gap-2 border-b bg-muted/40 px-3 py-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{block.title}</div>
          <div className="mt-1 text-xs text-muted-foreground" title={`${block.group} · ${block.source.type}`}>
            {CONTEXT_GROUP_LABELS[block.group] ?? block.group} · {SOURCE_TYPE_LABELS[block.source.type] ?? block.source.type}{block.source.id ? ` · ${block.source.id}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={block.required ? "default" : "secondary"}>
            {MATERIAL_IMPORTANCE_LABELS[block.importance]}
          </Badge>
          <Badge variant="outline">{block.estimatedTokens} tokens</Badge>
        </div>
      </div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap p-3 text-xs leading-relaxed">
        {block.content}
      </pre>
    </div>
  );
}

function PreviewPanel({ preview }: { preview: PromptPreviewResult | null }) {
  if (!preview) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        选择提示词后点击预览，查看最终消息、上下文选择和诊断结果。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">入口</div>
          <div className="mt-1 text-sm font-semibold">{preview.diagnostics.entrypoint}</div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">估算 Token</div>
          <div className="mt-1 text-sm font-semibold">{preview.context.estimatedInputTokens}</div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">选中上下文</div>
          <div className="mt-1 text-sm font-semibold">{preview.context.selectedBlockIds.length}</div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">缺失项</div>
          <div className="mt-1 text-sm font-semibold">{preview.diagnostics.missingRequiredGroups.length}</div>
        </div>
      </div>

      {preview.diagnostics.notes.length > 0 ? (
        <div className="rounded-md border bg-amber-50 p-3 text-sm text-amber-900">
          {preview.diagnostics.notes.join(" ")}
        </div>
      ) : null}

      <DetailSection title="最终消息">
        <div className="space-y-3">
          {preview.messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className="rounded-md border">
              <div className="border-b bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground" title={message.role}>
                {MESSAGE_ROLE_LABELS[message.role] ?? message.role}
              </div>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap p-3 text-xs leading-relaxed">
                {message.content}
              </pre>
            </div>
          ))}
        </div>
      </DetailSection>

      <DetailSection title="上下文诊断">
        <JsonBlock
          value={{
            selectedBlockIds: preview.context.selectedBlockIds,
            droppedBlockIds: preview.context.droppedBlockIds,
            missingRequiredGroups: preview.diagnostics.missingRequiredGroups,
            resolverErrors: preview.diagnostics.resolverErrors,
            tracePreview: preview.diagnostics.tracePreview,
          }}
        />
      </DetailSection>
    </div>
  );
}

export default function PromptWorkbenchPage() {
  const [keyword, setKeyword] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [entrypoint, setEntrypoint] = useState("manual_test");
  const [materialNovelId, setMaterialNovelId] = useState("");
  const [materialChapterId, setMaterialChapterId] = useState("");
  const [materialTaskId, setMaterialTaskId] = useState("");
  const [materialMaxTokens, setMaterialMaxTokens] = useState("6000");

  const catalogParamsKey = useMemo(() => JSON.stringify({ keyword: keyword.trim() }), [keyword]);
  const catalogQuery = useQuery({
    queryKey: queryKeys.promptWorkbench.catalog(catalogParamsKey),
    queryFn: () => getPromptCatalog(keyword.trim() ? { keyword: keyword.trim() } : {}),
    staleTime: 30_000,
  });

  const prompts = catalogQuery.data?.data ?? [];
  const selectedPrompt = prompts.find((item) => item.key === selectedKey) ?? prompts[0] ?? null;

  const previewMutation = useMutation({
    mutationFn: (prompt: PromptCatalogItem) => previewPrompt({
      promptKey: prompt.key,
      promptInput: buildPreviewPromptInput(prompt),
      executionContext: {
        entrypoint,
        novelId: "novel-1",
        chapterId: "chapter-1",
        userGoal: "查看提示词预览",
        resourceBindings: {
          novelId: "novel-1",
          chapterId: "chapter-1",
        },
      },
      maxContextTokens: prompt.contextPolicy.maxTokensBudget,
    }),
  });

  const materialGroups = useMemo(
    () => selectedPrompt?.contextRequirements.map((requirement) => requirement.group) ?? [],
    [selectedPrompt?.contextRequirements],
  );

  const materialsMutation = useMutation({
    mutationFn: () => exportNovelPromptMaterials({
      novelId: materialNovelId.trim(),
      chapterId: materialChapterId.trim() || undefined,
      taskId: materialTaskId.trim() || undefined,
      groups: materialGroups.length > 0 ? materialGroups : undefined,
      maxTokens: Number.parseInt(materialMaxTokens, 10) || 6000,
    }),
  });

  const selectedCapabilities = selectedPrompt ? capabilityLabels(selectedPrompt) : [];
  const preview = previewMutation.data?.data ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="shrink-0 border-b bg-muted/20 px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Braces className="h-4 w-4" />
              提示词管理
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">Prompt Workbench</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              查看内置提示词、定制可编辑槽位。槽位覆盖分全局和本书两级，保存后下次真实生成时生效。
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => void catalogQuery.refetch()}
            disabled={catalogQuery.isFetching}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", catalogQuery.isFetching && "animate-spin")} />
            刷新目录
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-6 p-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col gap-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索 id、任务类型、上下文或槽位"
              className="pl-9"
            />
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {catalogQuery.isLoading ? (
              <div className="rounded-md border p-4 text-sm text-muted-foreground">正在读取提示词目录...</div>
            ) : prompts.length === 0 ? (
              <div className="rounded-md border p-4 text-sm text-muted-foreground">没有匹配的提示词。</div>
            ) : (
              prompts.map((prompt) => (
                <PromptListItem
                  key={prompt.key}
                  prompt={prompt}
                  active={prompt.key === selectedPrompt?.key}
                  onSelect={() => {
                    setSelectedKey(prompt.key);
                    previewMutation.reset();
                    materialsMutation.reset();
                  }}
                />
              ))
            )}
          </div>
        </aside>

        <main className="min-h-0 space-y-6 overflow-y-auto pr-1">
          {selectedPrompt ? (
            <>
              <Card className="rounded-lg">
                <CardHeader className="pb-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <CardTitle className="text-xl tracking-normal">
                        {selectedPrompt.description || selectedPrompt.id}
                      </CardTitle>
                      <div className="mt-1 font-mono text-xs text-muted-foreground">{selectedPrompt.id}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge>{selectedPrompt.version}</Badge>
                        <Badge variant="secondary">{TASK_TYPE_LABELS[selectedPrompt.taskType] ?? selectedPrompt.taskType}</Badge>
                        <Badge variant="secondary">{OUTPUT_TYPE_LABELS[selectedPrompt.outputType] ?? selectedPrompt.outputType}</Badge>
                        <Badge variant={statusBadgeVariant(selectedPrompt.managementStatus)}>
                          {MANAGEMENT_STATUS_LABELS[selectedPrompt.managementStatus]}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={entrypoint}
                        onChange={(event) => setEntrypoint(event.target.value)}
                        className="h-10 rounded-md border bg-background px-3 text-sm"
                      >
                        {ENTRYPOINT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-5 lg:grid-cols-2">
                  <DetailSection title="基础信息">
                    <div className="rounded-md border divide-y text-sm">
                      {[
                        { label: "标识符", value: selectedPrompt.key },
                        { label: "语言", value: selectedPrompt.language === "zh" ? "中文" : selectedPrompt.language },
                        { label: "分组", value: selectedPrompt.family },
                        { label: "上下文预算", value: `${selectedPrompt.contextPolicy.maxTokensBudget} tokens` },
                        { label: "槽位", value: selectedPrompt.slotSupported ? `${selectedPrompt.slots.length} 个可定制槽位` : "不可定制" },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex items-center justify-between gap-4 px-3 py-2">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-mono text-xs text-right">{value}</span>
                        </div>
                      ))}
                    </div>
                  </DetailSection>

                  <DetailSection title="能力标记">
                    <div className="flex flex-wrap gap-2">
                      {selectedCapabilities.length > 0 ? selectedCapabilities.map((label) => (
                        <Badge key={label} variant="secondary">{label}</Badge>
                      )) : (
                        <span className="text-sm text-muted-foreground">当前提示词未声明结构化能力标记。</span>
                      )}
                    </div>
                  </DetailSection>

                  <DetailSection title="上下文需求">
                    <div className="space-y-2">
                      {selectedPrompt.contextRequirements.length > 0 ? selectedPrompt.contextRequirements.map((requirement) => (
                        <div key={requirement.group} className="rounded-md border p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-semibold" title={requirement.group}>{CONTEXT_GROUP_LABELS[requirement.group] ?? requirement.group}</span>
                            <Badge variant={requirement.required ? "default" : "outline"}>
                              {requirement.required ? "必需" : "辅助"}
                            </Badge>
                          </div>
                          {requirement.sourceHint ? (
                            <div className="mt-1 text-xs text-muted-foreground">{requirement.sourceHint}</div>
                          ) : null}
                        </div>
                      )) : (
                        <div className="rounded-md border p-3 text-sm text-muted-foreground">未声明上下文需求。</div>
                      )}
                    </div>
                  </DetailSection>

                  <DetailSection title="安全编辑边界">
                    <div className="space-y-3">
                      <div className="rounded-md border p-3">
                        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                          <ShieldCheck className="h-4 w-4 text-primary" />
                          可编辑槽位
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {selectedPrompt.slots.length > 0 ? selectedPrompt.slots.map((slot) => (
                            <Badge key={slot.key} variant="secondary">
                              {slot.label}
                              <span className="ml-1 opacity-60" title={slot.kind}>·{SLOT_KIND_LABELS[slot.kind] ?? slot.kind}</span>
                            </Badge>
                          )) : (
                            <span className="text-sm text-muted-foreground">未开放表达槽位。</span>
                          )}
                        </div>
                      </div>
                      <div className="rounded-md border p-3">
                        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                          <LockKeyhole className="h-4 w-4 text-primary" />
                          锁定字段
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {selectedPrompt.lockedFields.map((field) => (
                            <Badge key={field} variant="outline" title={field}>
                              {LOCKED_FIELD_LABELS[field] ?? field}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </DetailSection>
                </CardContent>
              </Card>

              <Card className="rounded-lg">
                <CardHeader>
                  <CardTitle className="text-lg tracking-normal">槽位定制</CardTitle>
                </CardHeader>
                <CardContent>
                  <PromptSlotPanel prompt={selectedPrompt} />
                </CardContent>
              </Card>

              <details className="rounded-lg border bg-card">
                <summary className="cursor-pointer px-6 py-4 text-lg font-semibold tracking-normal">
                  调试查看
                </summary>
                <div className="space-y-6 border-t p-6">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold tracking-normal">资料检查</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        按当前提示词需要的资料组读取小说资料，确认资料是否齐全。
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => materialsMutation.mutate()}
                      disabled={materialsMutation.isPending || !materialNovelId.trim()}
                    >
                      {materialsMutation.isPending ? "读取中..." : "读取资料"}
                    </Button>
                  </div>
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-4">
                      <Input
                        value={materialNovelId}
                        onChange={(event) => setMaterialNovelId(event.target.value)}
                        placeholder="小说 ID"
                      />
                      <Input
                        value={materialChapterId}
                        onChange={(event) => setMaterialChapterId(event.target.value)}
                        placeholder="章节 ID"
                      />
                      <Input
                        value={materialTaskId}
                        onChange={(event) => setMaterialTaskId(event.target.value)}
                        placeholder="任务 ID"
                      />
                      <Input
                        value={materialMaxTokens}
                        onChange={(event) => setMaterialMaxTokens(event.target.value)}
                        placeholder="资料预算"
                      />
                    </div>

                    <DetailSection title="需要的资料组">
                      <div className="flex flex-wrap gap-2">
                        {materialGroups.length > 0 ? materialGroups.map((group) => (
                          <Badge key={group} variant="outline" title={group}>{CONTEXT_GROUP_LABELS[group] ?? group}</Badge>
                        )) : (
                          <span className="text-sm text-muted-foreground">当前提示词未声明资料需求，将读取默认核心资料组。</span>
                        )}
                      </div>
                    </DetailSection>

                    {materialsMutation.data?.data ? (
                      <div className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-4">
                          <div className="rounded-md border p-3">
                            <div className="text-xs text-muted-foreground">已拿到</div>
                            <div className="mt-1 text-sm font-semibold">{materialsMutation.data.data.blocks.length}</div>
                          </div>
                          <div className="rounded-md border p-3">
                            <div className="text-xs text-muted-foreground">缺资料组</div>
                            <div className="mt-1 text-sm font-semibold">{materialsMutation.data.data.missingGroups.length}</div>
                          </div>
                          <div className="rounded-md border p-3">
                            <div className="text-xs text-muted-foreground">缺输入</div>
                            <div className="mt-1 text-sm font-semibold">{materialsMutation.data.data.missingInputs.length}</div>
                          </div>
                          <div className="rounded-md border p-3">
                            <div className="text-xs text-muted-foreground">裁剪提醒</div>
                            <div className="mt-1 text-sm font-semibold">{materialsMutation.data.data.warnings.length}</div>
                          </div>
                        </div>

                        {materialsMutation.data.data.missingInputs.length > 0 ? (
                          <div className="rounded-md border bg-amber-50 p-3 text-sm text-amber-900">
                            需要补充输入：{materialsMutation.data.data.missingInputs.join("、")}
                          </div>
                        ) : null}
                        {materialsMutation.data.data.missingGroups.length > 0 ? (
                          <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                            未拿到资料：{materialsMutation.data.data.missingGroups.join("、")}
                          </div>
                        ) : null}
                        {materialsMutation.data.data.warnings.length > 0 ? (
                          <div className="rounded-md border bg-amber-50 p-3 text-sm text-amber-900">
                            {materialsMutation.data.data.warnings.join(" ")}
                          </div>
                        ) : null}

                        <div className="space-y-3">
                          {materialsMutation.data.data.blocks.map((item) => (
                            <MaterialBlockCard key={item.id} block={item} />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                        输入小说 ID 后读取资料，检查当前提示词开工前的资料是否齐全。
                      </div>
                    )}

                    <div className="border-t pt-6">
                      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <h2 className="text-lg font-semibold tracking-normal">预览诊断</h2>
                          <p className="mt-1 text-sm text-muted-foreground">
                            查看最终消息、上下文选择和诊断结果。
                          </p>
                        </div>
                        <Button
                          type="button"
                          onClick={() => previewMutation.mutate(selectedPrompt)}
                          disabled={previewMutation.isPending}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          {previewMutation.isPending ? "预览中..." : "生成预览"}
                        </Button>
                      </div>
                      <PreviewPanel preview={preview} />
                    </div>
                  </div>
                </div>
              </details>
            </>
          ) : (
            <div className="rounded-md border p-6 text-sm text-muted-foreground">请选择一个提示词。</div>
          )}
        </main>
      </div>
    </div>
  );
}
