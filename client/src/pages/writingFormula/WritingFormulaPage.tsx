import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AntiAiRule, StyleBinding } from "@ai-novel/shared/types/styleEngine";
import OpenInCreativeHubButton from "@/components/creativeHub/OpenInCreativeHubButton";
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
import WritingFormulaEditorPanel from "./components/WritingFormulaEditorPanel";
import WritingFormulaRulesPanel from "./components/WritingFormulaRulesPanel";
import WritingFormulaSidebar from "./components/WritingFormulaSidebar";
import WritingFormulaWorkbenchPanel from "./components/WritingFormulaWorkbenchPanel";
import { normalizeCsv, parseJsonInput, prettyJson } from "./writingFormula.utils";

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
  const novelOptions = (novelListQuery.data?.data?.items ?? []).map((novel) => ({
    id: novel.id,
    title: novel.title,
  }));
  const chapterOptions = (novelDetailQuery.data?.data?.chapters ?? []).map((chapter) => ({
    id: chapter.id,
    order: chapter.order,
    title: chapter.title,
  }));
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

  async function refreshStyleData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.profiles }),
      queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.templates }),
      queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.antiAiRules }),
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
      await refreshStyleData();
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
      await refreshStyleData();
    },
  });

  const createFromTemplateMutation = useMutation({
    mutationFn: (templateId: string) => createStyleProfileFromTemplate({ templateId }),
    onSuccess: async (response) => {
      if (response.data) {
        setSelectedProfileId(response.data.id);
        setMessage("已基于模板创建写法资产。");
      }
      await refreshStyleData();
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
      await refreshStyleData();
    },
  });

  const deleteProfileMutation = useMutation({
    mutationFn: (id: string) => deleteStyleProfile(id),
    onSuccess: async () => {
      setSelectedProfileId("");
      setMessage("写法资产已删除。");
      await refreshStyleData();
    },
  });

  const toggleRuleMutation = useMutation({
    mutationFn: ({ rule, enabled }: { rule: AntiAiRule; enabled: boolean }) =>
      updateAntiAiRule(rule.id, { enabled }),
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">写法引擎</h1>
          <p className="text-sm text-muted-foreground">
            写法资产、模板、绑定、试写与反 AI 修正统一工作区。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <WritingFormulaRulesPanel
            antiAiRules={antiAiRules}
            onToggleRule={(rule, enabled) => toggleRuleMutation.mutate({ rule, enabled })}
          />
          <OpenInCreativeHubButton bindings={{ styleProfileId: selectedProfileId || null }} label="写法资产发往创作中枢" />
        </div>
      </div>

      {message ? <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{message}</div> : null}

      <div className="grid flex-1 min-h-0 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <WritingFormulaSidebar
          createForm={createForm}
          onCreateFormChange={(patch) => setCreateForm((prev) => ({ ...prev, ...patch }))}
          onCreateManual={() => createManualMutation.mutate()}
          onCreateFromText={() => createFromTextMutation.mutate()}
          onCreateFromTemplate={(templateId) => createFromTemplateMutation.mutate(templateId)}
          createManualPending={createManualMutation.isPending}
          createFromTextPending={createFromTextMutation.isPending}
          createFromTemplatePending={createFromTemplateMutation.isPending}
          templates={templates}
          profiles={profiles}
          selectedProfileId={selectedProfileId}
          onSelectProfile={setSelectedProfileId}
        />

        <div className="space-y-4 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
          <WritingFormulaEditorPanel
            selectedProfile={selectedProfile}
            editor={editor}
            antiAiRules={antiAiRules}
            savePending={saveProfileMutation.isPending}
            deletePending={deleteProfileMutation.isPending}
            onEditorChange={(patch) => setEditor((prev) => ({ ...prev, ...patch }))}
            onToggleAntiAiRule={(ruleId, checked) => setEditor((prev) => ({
              ...prev,
              antiAiRuleIds: checked
                ? [...prev.antiAiRuleIds, ruleId]
                : prev.antiAiRuleIds.filter((item) => item !== ruleId),
            }))}
            onSave={() => saveProfileMutation.mutate()}
            onDelete={() => selectedProfile && deleteProfileMutation.mutate(selectedProfile.id)}
          />

          <WritingFormulaWorkbenchPanel
            selectedProfileId={selectedProfileId}
            bindingForm={bindingForm}
            bindings={bindings}
            novelOptions={novelOptions}
            chapterOptions={chapterOptions}
            createBindingPending={createBindingMutation.isPending}
            onBindingFormChange={(patch) => setBindingForm((prev) => ({ ...prev, ...patch }))}
            onCreateBinding={() => createBindingMutation.mutate()}
            onDeleteBinding={(bindingId) => deleteBindingMutation.mutate(bindingId)}
            testWriteForm={testWriteForm}
            testWriteOutput={testWriteOutput}
            testWritePending={testWriteMutation.isPending}
            onTestWriteFormChange={(patch) => setTestWriteForm((prev) => ({ ...prev, ...patch }))}
            onRunTestWrite={() => testWriteMutation.mutate()}
            detectInput={detectInput}
            detectionReport={detectionMutation.data?.data ?? null}
            detectionPending={detectionMutation.isPending}
            rewritePending={rewriteMutation.isPending}
            rewritePreview={rewritePreview}
            onDetectInputChange={setDetectInput}
            onDetect={() => detectionMutation.mutate()}
            onRewrite={() => rewriteMutation.mutate()}
          />
        </div>
      </div>
    </div>
  );
}
