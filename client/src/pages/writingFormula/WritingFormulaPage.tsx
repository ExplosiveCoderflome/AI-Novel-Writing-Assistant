import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AntiAiRule, StyleBinding } from "@ai-novel/shared/types/styleEngine";
import OpenInCreativeHubButton from "@/components/creativeHub/OpenInCreativeHubButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getNovelDetail, getNovelList } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import {
  createManualStyleProfile,
  createStyleBinding,
  createStyleProfileFromTemplate,
  createStyleProfileFromText,
  deleteStyleBinding,
  deleteStyleProfile,
  detectStyleIssues,
  getAntiAiRules,
  getStyleBindings,
  getStyleProfiles,
  getStyleTemplates,
  rewriteStyleIssues,
  testWriteWithStyleProfile,
  updateAntiAiRule,
  updateStyleProfile,
} from "@/api/styleEngine";
import { useLLMStore } from "@/store/llmStore";

function prettyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function parseJsonInput(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function normalizeCsv(value: string) {
  return value.split(/[，,]/).map((item) => item.trim()).filter(Boolean);
}

export default function WritingFormulaPage() {
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [message, setMessage] = useState("");
  const [createForm, setCreateForm] = useState({
    manualName: "",
    extractName: "",
    extractCategory: "",
    extractSourceText: "",
  });
  const [editor, setEditor] = useState({
    name: "",
    description: "",
    category: "",
    tags: "",
    applicableGenres: "",
    analysisMarkdown: "",
    narrativeRules: "{}",
    characterRules: "{}",
    languageRules: "{}",
    rhythmRules: "{}",
    antiAiRuleIds: [] as string[],
  });
  const [bindingForm, setBindingForm] = useState({
    targetType: "novel" as StyleBinding["targetType"],
    novelId: "",
    chapterId: "",
    taskTargetId: "",
    priority: 1,
    weight: 1,
  });
  const [testWriteForm, setTestWriteForm] = useState({
    mode: "generate" as "generate" | "rewrite",
    topic: "",
    sourceText: "",
    targetLength: 1200,
  });
  const [testWriteOutput, setTestWriteOutput] = useState("");
  const [detectInput, setDetectInput] = useState("");
  const [rewritePreview, setRewritePreview] = useState("");

  const profilesQuery = useQuery({
    queryKey: queryKeys.styleEngine.profiles,
    queryFn: getStyleProfiles,
  });
  const templatesQuery = useQuery({
    queryKey: queryKeys.styleEngine.templates,
    queryFn: getStyleTemplates,
  });
  const antiAiRulesQuery = useQuery({
    queryKey: queryKeys.styleEngine.antiAiRules,
    queryFn: getAntiAiRules,
  });
  const novelListQuery = useQuery({
    queryKey: queryKeys.novels.list(1, 100),
    queryFn: () => getNovelList({ page: 1, limit: 100 }),
  });
  const novelDetailQuery = useQuery({
    queryKey: queryKeys.novels.detail(bindingForm.novelId || "none"),
    queryFn: () => getNovelDetail(bindingForm.novelId),
    enabled: Boolean(bindingForm.novelId),
  });
  const bindingsQuery = useQuery({
    queryKey: queryKeys.styleEngine.bindings(selectedProfileId || "all"),
    queryFn: () => getStyleBindings(selectedProfileId ? { styleProfileId: selectedProfileId } : undefined),
  });

  const profiles = profilesQuery.data?.data ?? [];
  const templates = templatesQuery.data?.data ?? [];
  const antiAiRules = antiAiRulesQuery.data?.data ?? [];
  const bindings = bindingsQuery.data?.data ?? [];
  const novelOptions = novelListQuery.data?.data?.items ?? [];
  const chapterOptions = novelDetailQuery.data?.data?.chapters ?? [];
  const selectedProfile = useMemo(
    () => profiles.find((item) => item.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );

  useEffect(() => {
    if (!selectedProfileId && profiles.length > 0) {
      setSelectedProfileId(profiles[0].id);
    }
  }, [profiles, selectedProfileId]);

  useEffect(() => {
    if (!bindingForm.novelId && novelOptions.length > 0) {
      setBindingForm((prev) => ({ ...prev, novelId: novelOptions[0].id }));
    }
  }, [bindingForm.novelId, novelOptions]);

  useEffect(() => {
    if (!selectedProfile) {
      return;
    }
    setEditor({
      name: selectedProfile.name,
      description: selectedProfile.description ?? "",
      category: selectedProfile.category ?? "",
      tags: selectedProfile.tags.join(", "),
      applicableGenres: selectedProfile.applicableGenres.join(", "),
      analysisMarkdown: selectedProfile.analysisMarkdown ?? "",
      narrativeRules: prettyJson(selectedProfile.narrativeRules),
      characterRules: prettyJson(selectedProfile.characterRules),
      languageRules: prettyJson(selectedProfile.languageRules),
      rhythmRules: prettyJson(selectedProfile.rhythmRules),
      antiAiRuleIds: selectedProfile.antiAiRules.map((rule) => rule.id),
    });
    setTestWriteOutput("");
    setDetectInput("");
    setRewritePreview("");
  }, [selectedProfile]);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.profiles }),
      queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.templates }),
      queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.bindings(selectedProfileId || "all") }),
    ]);
  }

  const createManualMutation = useMutation({
    mutationFn: () => createManualStyleProfile({ name: createForm.manualName }),
    onSuccess: async (response) => {
      if (response.data) {
        setSelectedProfileId(response.data.id);
        setCreateForm((prev) => ({ ...prev, manualName: "" }));
        setMessage("已创建空白写法资产。");
      }
      await refresh();
    },
  });

  const createFromTextMutation = useMutation({
    mutationFn: () => createStyleProfileFromText({
      name: createForm.extractName,
      category: createForm.extractCategory || undefined,
      sourceText: createForm.extractSourceText,
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
    }),
    onSuccess: async (response) => {
      if (response.data) {
        setSelectedProfileId(response.data.id);
        setMessage("已从文本提取写法资产。");
      }
      await refresh();
    },
  });

  const createFromTemplateMutation = useMutation({
    mutationFn: (templateId: string) => createStyleProfileFromTemplate({ templateId }),
    onSuccess: async (response) => {
      if (response.data) {
        setSelectedProfileId(response.data.id);
        setMessage("已从模板新建写法资产。");
      }
      await refresh();
    },
  });

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProfileId) {
        return;
      }
      await updateStyleProfile(selectedProfileId, {
        name: editor.name,
        description: editor.description,
        category: editor.category,
        tags: normalizeCsv(editor.tags),
        applicableGenres: normalizeCsv(editor.applicableGenres),
        analysisMarkdown: editor.analysisMarkdown,
        narrativeRules: parseJsonInput(editor.narrativeRules),
        characterRules: parseJsonInput(editor.characterRules),
        languageRules: parseJsonInput(editor.languageRules),
        rhythmRules: parseJsonInput(editor.rhythmRules),
        antiAiRuleIds: editor.antiAiRuleIds,
      });
    },
    onSuccess: async () => {
      setMessage("写法资产已保存。");
      await refresh();
    },
  });

  const deleteProfileMutation = useMutation({
    mutationFn: (id: string) => deleteStyleProfile(id),
    onSuccess: async () => {
      setSelectedProfileId("");
      setMessage("写法资产已删除。");
      await refresh();
    },
  });

  const toggleRuleMutation = useMutation({
    mutationFn: ({ rule, enabled }: { rule: AntiAiRule; enabled: boolean }) => updateAntiAiRule(rule.id, { enabled }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.antiAiRules });
    },
  });

  const createBindingMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProfileId) {
        return;
      }
      const targetId = bindingForm.targetType === "chapter"
        ? bindingForm.chapterId
        : bindingForm.targetType === "task"
          ? bindingForm.taskTargetId
          : bindingForm.novelId;
      await createStyleBinding({
        styleProfileId: selectedProfileId,
        targetType: bindingForm.targetType,
        targetId,
        priority: bindingForm.priority,
        weight: bindingForm.weight,
      });
    },
    onSuccess: async () => {
      setMessage("写法绑定已创建。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.bindings(selectedProfileId || "all") });
    },
  });

  const deleteBindingMutation = useMutation({
    mutationFn: (id: string) => deleteStyleBinding(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.bindings(selectedProfileId || "all") });
    },
  });

  const testWriteMutation = useMutation({
    mutationFn: () => {
      if (!selectedProfileId) {
        throw new Error("请先选择写法资产。");
      }
      return testWriteWithStyleProfile(selectedProfileId, {
        mode: testWriteForm.mode,
        topic: testWriteForm.topic || undefined,
        sourceText: testWriteForm.sourceText || undefined,
        targetLength: testWriteForm.targetLength,
        provider: llm.provider,
        model: llm.model,
        temperature: llm.temperature,
      });
    },
    onSuccess: (response) => setTestWriteOutput(response.data?.output ?? ""),
  });

  const detectionMutation = useMutation({
    mutationFn: () => {
      if (!selectedProfileId) {
        throw new Error("请先选择写法资产。");
      }
      return detectStyleIssues({
        content: detectInput,
        styleProfileId: selectedProfileId,
        provider: llm.provider,
        model: llm.model,
        temperature: 0.2,
      });
    },
  });

  const rewriteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProfileId) {
        throw new Error("请先选择写法资产。");
      }
      const report = detectionMutation.data?.data ?? (await detectStyleIssues({
        content: detectInput,
        styleProfileId: selectedProfileId,
        provider: llm.provider,
        model: llm.model,
        temperature: 0.2,
      })).data;
      if (!report || report.violations.length === 0) {
        return { data: { content: detectInput } };
      }
      return rewriteStyleIssues({
        content: detectInput,
        styleProfileId: selectedProfileId,
        issues: report.violations.map((item) => ({
          ruleName: item.ruleName,
          excerpt: item.excerpt,
          suggestion: item.suggestion,
        })),
        provider: llm.provider,
        model: llm.model,
        temperature: 0.5,
      });
    },
    onSuccess: (response) => setRewritePreview(response.data?.content ?? ""),
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">写法引擎</h1>
          <p className="text-sm text-muted-foreground">写法资产、模板、绑定、试写与反 AI 修正统一工作区。</p>
        </div>
        <OpenInCreativeHubButton bindings={{ styleProfileId: selectedProfileId || null }} label="写法资产发往创作中枢" />
      </div>

      {message ? <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{message}</div> : null}

      <div className="grid flex-1 min-h-0 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <div className="space-y-4 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
          <Card>
            <CardHeader><CardTitle>新建写法</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <input
                className="w-full rounded-md border p-2 text-sm"
                placeholder="手动创建名称"
                value={createForm.manualName}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, manualName: event.target.value }))}
              />
              <Button className="w-full" onClick={() => createManualMutation.mutate()} disabled={!createForm.manualName.trim() || createManualMutation.isPending}>
                创建空白资产
              </Button>
              <div className="rounded-md border p-3">
                <div className="mb-2 text-sm font-medium">从文本提取</div>
                <input
                  className="mb-2 w-full rounded-md border p-2 text-sm"
                  placeholder="写法名称"
                  value={createForm.extractName}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, extractName: event.target.value }))}
                />
                <input
                  className="mb-2 w-full rounded-md border p-2 text-sm"
                  placeholder="分类（可选）"
                  value={createForm.extractCategory}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, extractCategory: event.target.value }))}
                />
                <textarea
                  className="min-h-[160px] w-full rounded-md border p-2 text-sm"
                  placeholder="粘贴参考文本"
                  value={createForm.extractSourceText}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, extractSourceText: event.target.value }))}
                />
                <Button className="mt-2 w-full" onClick={() => createFromTextMutation.mutate()} disabled={!createForm.extractName.trim() || !createForm.extractSourceText.trim() || createFromTextMutation.isPending}>
                  AI 提取写法
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>内置模板</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {templates.map((template) => (
                <div key={template.id} className="rounded-md border p-3">
                  <div className="font-medium">{template.name}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{template.description}</div>
                  <Button size="sm" className="mt-3 w-full" onClick={() => createFromTemplateMutation.mutate(template.id)} disabled={createFromTemplateMutation.isPending}>
                    基于模板新建
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>我的写法资产</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  className={`w-full rounded-md border p-3 text-left ${profile.id === selectedProfileId ? "border-primary bg-primary/5" : ""}`}
                  onClick={() => setSelectedProfileId(profile.id)}
                >
                  <div className="font-medium">{profile.name}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{profile.description || "暂无简介"}</div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>写法编辑</CardTitle>
                {selectedProfile ? (
                  <Button size="sm" variant="destructive" onClick={() => deleteProfileMutation.mutate(selectedProfile.id)} disabled={deleteProfileMutation.isPending}>
                    删除
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selectedProfile ? <div className="text-sm text-muted-foreground">请选择一个写法资产。</div> : (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <input className="rounded-md border p-2 text-sm" value={editor.name} onChange={(event) => setEditor((prev) => ({ ...prev, name: event.target.value }))} />
                    <input className="rounded-md border p-2 text-sm" placeholder="分类" value={editor.category} onChange={(event) => setEditor((prev) => ({ ...prev, category: event.target.value }))} />
                  </div>
                  <textarea className="min-h-[80px] w-full rounded-md border p-2 text-sm" placeholder="简介" value={editor.description} onChange={(event) => setEditor((prev) => ({ ...prev, description: event.target.value }))} />
                  <div className="grid gap-3 md:grid-cols-2">
                    <input className="rounded-md border p-2 text-sm" placeholder="标签，逗号分隔" value={editor.tags} onChange={(event) => setEditor((prev) => ({ ...prev, tags: event.target.value }))} />
                    <input className="rounded-md border p-2 text-sm" placeholder="适用题材，逗号分隔" value={editor.applicableGenres} onChange={(event) => setEditor((prev) => ({ ...prev, applicableGenres: event.target.value }))} />
                  </div>
                  <textarea className="min-h-[90px] w-full rounded-md border p-2 text-sm" placeholder="AI 草稿 / 分析说明" value={editor.analysisMarkdown} onChange={(event) => setEditor((prev) => ({ ...prev, analysisMarkdown: event.target.value }))} />
                  <div className="grid gap-3 md:grid-cols-2">
                    <textarea className="min-h-[170px] rounded-md border p-2 font-mono text-xs" value={editor.narrativeRules} onChange={(event) => setEditor((prev) => ({ ...prev, narrativeRules: event.target.value }))} />
                    <textarea className="min-h-[170px] rounded-md border p-2 font-mono text-xs" value={editor.characterRules} onChange={(event) => setEditor((prev) => ({ ...prev, characterRules: event.target.value }))} />
                    <textarea className="min-h-[170px] rounded-md border p-2 font-mono text-xs" value={editor.languageRules} onChange={(event) => setEditor((prev) => ({ ...prev, languageRules: event.target.value }))} />
                    <textarea className="min-h-[170px] rounded-md border p-2 font-mono text-xs" value={editor.rhythmRules} onChange={(event) => setEditor((prev) => ({ ...prev, rhythmRules: event.target.value }))} />
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="mb-2 text-sm font-medium">绑定反 AI 规则</div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {antiAiRules.map((rule) => (
                        <label key={rule.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                          <input
                            type="checkbox"
                            checked={editor.antiAiRuleIds.includes(rule.id)}
                            onChange={(event) => setEditor((prev) => ({
                              ...prev,
                              antiAiRuleIds: event.target.checked
                                ? [...prev.antiAiRuleIds, rule.id]
                                : prev.antiAiRuleIds.filter((item) => item !== rule.id),
                            }))}
                          />
                          <span>
                            <span className="font-medium">{rule.name}</span>
                            <span className="mt-1 block text-xs text-muted-foreground">{rule.description}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <Button onClick={() => saveProfileMutation.mutate()} disabled={saveProfileMutation.isPending || !editor.name.trim()}>
                    保存写法资产
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>应用与测试</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border p-3">
                <div className="mb-2 text-sm font-medium">绑定到目标</div>
                <div className="grid gap-2 md:grid-cols-2">
                  <select className="rounded-md border p-2 text-sm" value={bindingForm.targetType} onChange={(event) => setBindingForm((prev) => ({ ...prev, targetType: event.target.value as StyleBinding["targetType"] }))}>
                    <option value="novel">整本书</option>
                    <option value="chapter">章节</option>
                    <option value="task">本次任务</option>
                  </select>
                  <select className="rounded-md border p-2 text-sm" value={bindingForm.novelId} onChange={(event) => setBindingForm((prev) => ({ ...prev, novelId: event.target.value, chapterId: "" }))}>
                    {novelOptions.map((novel) => <option key={novel.id} value={novel.id}>{novel.title}</option>)}
                  </select>
                  {bindingForm.targetType === "chapter" ? (
                    <select className="rounded-md border p-2 text-sm" value={bindingForm.chapterId} onChange={(event) => setBindingForm((prev) => ({ ...prev, chapterId: event.target.value }))}>
                      <option value="">选择章节</option>
                      {chapterOptions.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.order}. {chapter.title}</option>)}
                    </select>
                  ) : null}
                  {bindingForm.targetType === "task" ? (
                    <input className="rounded-md border p-2 text-sm" placeholder="任务标识" value={bindingForm.taskTargetId} onChange={(event) => setBindingForm((prev) => ({ ...prev, taskTargetId: event.target.value }))} />
                  ) : null}
                  <input className="rounded-md border p-2 text-sm" type="number" min={0} max={99} value={bindingForm.priority} onChange={(event) => setBindingForm((prev) => ({ ...prev, priority: Number(event.target.value) || 1 }))} />
                  <input className="rounded-md border p-2 text-sm" type="number" min={0.3} max={1} step={0.1} value={bindingForm.weight} onChange={(event) => setBindingForm((prev) => ({ ...prev, weight: Number(event.target.value) || 1 }))} />
                </div>
                <Button className="mt-3" onClick={() => createBindingMutation.mutate()} disabled={createBindingMutation.isPending || !selectedProfileId}>
                  创建绑定
                </Button>
                <div className="mt-3 space-y-2">
                  {bindings.map((binding) => (
                    <div key={binding.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                      <span>{binding.targetType} · {binding.targetId} · P{binding.priority} · W{binding.weight}</span>
                      <Button size="sm" variant="ghost" onClick={() => deleteBindingMutation.mutate(binding.id)}>删除</Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-md border p-3">
                <div className="mb-2 text-sm font-medium">试写</div>
                <select className="mb-2 w-full rounded-md border p-2 text-sm" value={testWriteForm.mode} onChange={(event) => setTestWriteForm((prev) => ({ ...prev, mode: event.target.value as "generate" | "rewrite" }))}>
                  <option value="generate">生成正文</option>
                  <option value="rewrite">改写文本</option>
                </select>
                {testWriteForm.mode === "generate" ? (
                  <input className="mb-2 w-full rounded-md border p-2 text-sm" placeholder="输入主题" value={testWriteForm.topic} onChange={(event) => setTestWriteForm((prev) => ({ ...prev, topic: event.target.value }))} />
                ) : (
                  <textarea className="mb-2 min-h-[120px] w-full rounded-md border p-2 text-sm" placeholder="粘贴待改写文本" value={testWriteForm.sourceText} onChange={(event) => setTestWriteForm((prev) => ({ ...prev, sourceText: event.target.value }))} />
                )}
                <Button onClick={() => testWriteMutation.mutate()} disabled={testWriteMutation.isPending || !selectedProfileId}>执行试写</Button>
                {testWriteOutput ? <pre className="mt-3 max-h-[260px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-sm">{testWriteOutput}</pre> : null}
              </div>

              <div className="rounded-md border p-3">
                <div className="mb-2 text-sm font-medium">AI 味检测与修正</div>
                <textarea className="min-h-[150px] w-full rounded-md border p-2 text-sm" placeholder="粘贴待检测正文" value={detectInput} onChange={(event) => setDetectInput(event.target.value)} />
                <div className="mt-2 flex gap-2">
                  <Button onClick={() => detectionMutation.mutate()} disabled={detectionMutation.isPending || !selectedProfileId || !detectInput.trim()}>执行检测</Button>
                  <Button variant="secondary" onClick={() => rewriteMutation.mutate()} disabled={rewriteMutation.isPending || !selectedProfileId || !detectInput.trim()}>一键修正</Button>
                </div>
                {detectionMutation.data?.data ? (
                  <div className="mt-3 rounded-md border p-3 text-sm">
                    <div className="font-medium">风险分：{detectionMutation.data.data.riskScore}</div>
                    <div className="mt-1 text-muted-foreground">{detectionMutation.data.data.summary}</div>
                    <div className="mt-2 space-y-2">
                      {detectionMutation.data.data.violations.map((item, index) => (
                        <div key={`${item.ruleId}-${index}`} className="rounded-md border p-2">
                          <div className="font-medium">{item.ruleName}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{item.reason}</div>
                          <div className="mt-1 whitespace-pre-wrap text-xs">{item.excerpt}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {rewritePreview ? <pre className="mt-3 max-h-[260px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-sm">{rewritePreview}</pre> : null}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
          <Card>
            <CardHeader><CardTitle>反 AI 特征库</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {antiAiRules.map((rule) => (
                <div key={rule.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{rule.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{rule.type} · {rule.severity}</div>
                    </div>
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={rule.enabled} onChange={(event) => toggleRuleMutation.mutate({ rule, enabled: event.target.checked })} />
                      启用
                    </label>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">{rule.description}</div>
                  <div className="mt-2 text-xs text-muted-foreground">{rule.rewriteSuggestion}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
