import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AntiAiRule } from "@ai-novel/shared/types/styleEngine";
import { Plus, ShieldCheck } from "lucide-react";
import {
  createAntiAiRule,
  detectStyleIssues,
  generateAntiAiRuleDraft,
  getAntiAiRules,
  getEffectiveAntiAiRules,
  getStyleProfiles,
  rewriteStyleIssues,
  updateAntiAiRule,
} from "@/api/styleEngine";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { useLLMStore } from "@/store/llmStore";
import {
  RuleFilter,
  RuleFormState,
  buildEffectiveParamsKey,
  buildPayload,
  emptyForm,
  parsePatternText,
  ruleToForm,
} from "./antiAiRulesPage.shared";
import AntiAiEffectivePreviewCard from "./components/AntiAiEffectivePreviewCard";
import AntiAiRuleDialog from "./components/AntiAiRuleDialog";
import AntiAiRuleEffectTestCard from "./components/AntiAiRuleEffectTestCard";
import AntiAiRuleList from "./components/AntiAiRuleList";
import AntiAiRuleStats from "./components/AntiAiRuleStats";

export default function AntiAiRulesPage() {
  const queryClient = useQueryClient();
  const llm = useLLMStore();
  const [filter, setFilter] = useState<RuleFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AntiAiRule | null>(null);
  const [form, setForm] = useState<RuleFormState>(emptyForm);
  const [aiInstruction, setAiInstruction] = useState("");
  const [previewStyleProfileId, setPreviewStyleProfileId] = useState("");
  const [testingRuleIds, setTestingRuleIds] = useState<string[]>([]);
  const [testInput, setTestInput] = useState("");
  const [rewritePreview, setRewritePreview] = useState("");

  const rulesQuery = useQuery({
    queryKey: queryKeys.styleEngine.antiAiRules,
    queryFn: getAntiAiRules,
  });
  const profilesQuery = useQuery({
    queryKey: queryKeys.styleEngine.profiles,
    queryFn: getStyleProfiles,
  });
  const effectiveKey = buildEffectiveParamsKey(previewStyleProfileId);
  const effectiveQuery = useQuery({
    queryKey: queryKeys.styleEngine.effectiveAntiAiRules(effectiveKey),
    queryFn: () => getEffectiveAntiAiRules(previewStyleProfileId ? { styleProfileId: previewStyleProfileId } : undefined),
  });

  const rules = rulesQuery.data?.data ?? [];
  const profiles = profilesQuery.data?.data ?? [];
  const effective = effectiveQuery.data?.data;

  const stats = useMemo(() => ({
    total: rules.length,
    enabled: rules.filter((rule) => rule.enabled).length,
    global: rules.filter((rule) => rule.enabled && rule.globalBaselineEnabled).length,
    autoRewrite: rules.filter((rule) => rule.enabled && rule.autoRewrite).length,
  }), [rules]);

  const filteredRules = useMemo(() => {
    if (filter === "global") {
      return rules.filter((rule) => rule.enabled && rule.globalBaselineEnabled);
    }
    if (filter === "style") {
      return rules.filter((rule) => rule.enabled && !rule.globalBaselineEnabled);
    }
    if (filter === "disabled") {
      return rules.filter((rule) => !rule.enabled);
    }
    return rules;
  }, [filter, rules]);

  const testingRules = useMemo(
    () => testingRuleIds
      .map((ruleId) => rules.find((rule) => rule.id === ruleId))
      .filter((rule): rule is AntiAiRule => Boolean(rule)),
    [rules, testingRuleIds],
  );
  const testPreviewRuleIds = useMemo(() => {
    const ids = previewStyleProfileId
      ? testingRuleIds
      : [
        ...(effective?.globalBaselineRules.map((item) => item.rule.id) ?? []),
        ...testingRuleIds,
      ];
    return Array.from(new Set(ids));
  }, [effective?.globalBaselineRules, previewStyleProfileId, testingRuleIds]);

  const refreshRules = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.antiAiRules }),
      queryClient.invalidateQueries({ queryKey: ["style-engine", "anti-ai-rules", "effective"] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.profiles }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof buildPayload>) => createAntiAiRule(payload),
    onSuccess: async () => {
      await refreshRules();
      toast.success(t("gen.pages.antiAiRules.AntiAiRulesPage.gen_f829c4e3"));
      setDialogOpen(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("gen.pages.antiAiRules.AntiAiRulesPage.gen_5d41aa1f")),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<ReturnType<typeof buildPayload>> }) => updateAntiAiRule(id, payload),
    onSuccess: async () => {
      await refreshRules();
      toast.success(t("gen.pages.antiAiRules.AntiAiRulesPage.gen_e0dcdc7e"));
      setDialogOpen(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("gen.pages.antiAiRules.AntiAiRulesPage.saveRulesFailedDot")),
  });

  const aiDraftMutation = useMutation({
    mutationFn: () => generateAntiAiRuleDraft({
      mode: editingRule ? "improve" : "create",
      instruction: aiInstruction.trim(),
      currentRule: editingRule ? {
        key: form.key,
        name: form.name,
        type: form.type,
        severity: form.severity,
        description: form.description,
        detectPatterns: parsePatternText(form.detectPatternsText),
        promptInstruction: form.promptInstruction || null,
        rewriteSuggestion: form.rewriteSuggestion || null,
        enabled: form.enabled,
        globalBaselineEnabled: form.globalBaselineEnabled,
        autoRewrite: form.autoRewrite,
      } : undefined,
    }),
    onSuccess: (response) => {
      const result = response.data;
      if (!result) {
        toast.error(t("gen.pages.antiAiRules.AntiAiRulesPage.aiNoAvailableDraft"));
        return;
      }
      setForm({
        key: result.draft.key,
        name: result.draft.name,
        type: result.draft.type,
        severity: result.draft.severity,
        description: result.draft.description,
        detectPatternsText: result.draft.detectPatterns.join("\n"),
        promptInstruction: result.draft.promptInstruction ?? "",
        rewriteSuggestion: result.draft.rewriteSuggestion ?? "",
        enabled: result.draft.enabled,
        globalBaselineEnabled: result.draft.globalBaselineEnabled,
        autoRewrite: result.draft.autoRewrite,
      });
      toast.success(t("gen.pages.antiAiRules.AntiAiRulesPage.gen_f7e519a6"));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("gen.pages.antiAiRules.AntiAiRulesPage.aiFailedToGenerateDraft")),
  });

  const detectionMutation = useMutation({
    mutationFn: () => detectStyleIssues({
      content: testInput,
      styleProfileId: previewStyleProfileId || undefined,
      previewAntiAiRuleIds: testPreviewRuleIds,
      provider: llm.provider,
      model: llm.model,
      temperature: 0.2,
    }),
    onSuccess: () => setRewritePreview(""),
    onError: (error) => toast.error(error instanceof Error ? error.message : t("gen.pages.antiAiRules.AntiAiRulesPage.gen_fc0bacd6")),
  });

  const rewriteMutation = useMutation({
    mutationFn: async () => {
      const report = detectionMutation.data?.data ?? (await detectStyleIssues({
        content: testInput,
        styleProfileId: previewStyleProfileId || undefined,
        previewAntiAiRuleIds: testPreviewRuleIds,
        provider: llm.provider,
        model: llm.model,
        temperature: 0.2,
      })).data;

      if (!report || report.violations.length === 0) {
        return { data: { content: testInput } };
      }

      return rewriteStyleIssues({
        content: testInput,
        styleProfileId: previewStyleProfileId || undefined,
        previewAntiAiRuleIds: testPreviewRuleIds,
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
    onError: (error) => toast.error(error instanceof Error ? error.message : t("gen.pages.antiAiRules.AntiAiRulesPage.gen_59f7c94a")),
  });

  useEffect(() => {
    detectionMutation.reset();
    rewriteMutation.reset();
    setRewritePreview("");
  }, [previewStyleProfileId, testPreviewRuleIds.join("|")]);

  const openCreateDialog = () => {
    setEditingRule(null);
    setForm(emptyForm);
    setAiInstruction("");
    setDialogOpen(true);
  };

  const openEditDialog = (rule: AntiAiRule) => {
    setEditingRule(rule);
    setForm(ruleToForm(rule));
    setAiInstruction("");
    setDialogOpen(true);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const payload = buildPayload(form);
    if (!payload.key || !payload.name || !payload.description) {
      toast.error(t("gen.pages.antiAiRules.AntiAiRulesPage.gen_2d603f07"));
      return;
    }
    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, payload });
      return;
    }
    createMutation.mutate(payload);
  };

  const handleQuickToggle = (rule: AntiAiRule, field: "enabled" | "globalBaselineEnabled" | "autoRewrite", checked: boolean) => {
    updateMutation.mutate({ id: rule.id, payload: { [field]: checked } });
  };

  const toggleTestingRule = (ruleId: string) => {
    setTestingRuleIds((prev) => (
      prev.includes(ruleId) ? prev.filter((item) => item !== ruleId) : [...prev, ruleId]
    ));
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              反 AI 规则
            </CardTitle>
            <CardDescription>
              管理正文生成会参考的反 AI 规则，控制哪些规则进入全局默认，哪些只留给写法资产绑定使用。
            </CardDescription>
          </div>
          <Button type="button" onClick={openCreateDialog}>
            <Plus className="h-4 w-4" />
            新建规则
          </Button>
        </CardHeader>
        <CardContent>
          <AntiAiRuleStats {...stats} />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <AntiAiRuleList
          rules={filteredRules}
          loading={rulesQuery.isLoading}
          filter={filter}
          isSaving={isSaving}
          testingRuleIds={testingRuleIds}
          onFilterChange={setFilter}
          onQuickToggle={handleQuickToggle}
          onEditRule={openEditDialog}
          onToggleTestingRule={toggleTestingRule}
        />

        <div className="space-y-4">
          <AntiAiEffectivePreviewCard
            profiles={profiles}
            styleProfileId={previewStyleProfileId}
            effective={effective}
            loading={effectiveQuery.isLoading}
            onStyleProfileChange={setPreviewStyleProfileId}
          />
          <AntiAiRuleEffectTestCard
            content={testInput}
            report={detectionMutation.data?.data ?? null}
            rewritePreview={rewritePreview}
            detectionPending={detectionMutation.isPending}
            rewritePending={rewriteMutation.isPending}
            effectiveRuleCount={effective?.effectiveRules.length ?? 0}
            previewRules={testingRules}
            onContentChange={setTestInput}
            onDetect={() => detectionMutation.mutate()}
            onRewrite={() => rewriteMutation.mutate()}
            onRemovePreviewRule={(ruleId) => setTestingRuleIds((prev) => prev.filter((item) => item !== ruleId))}
            onClearPreviewRules={() => setTestingRuleIds([])}
          />
        </div>
      </div>

      <AntiAiRuleDialog
        open={dialogOpen}
        editingRule={editingRule}
        form={form}
        aiInstruction={aiInstruction}
        isSaving={isSaving}
        isAiDrafting={aiDraftMutation.isPending}
        onOpenChange={setDialogOpen}
        onFormChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
        onAiInstructionChange={setAiInstruction}
        onGenerateDraft={() => aiDraftMutation.mutate()}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
