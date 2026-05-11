import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AntiAiEffectiveRuleItem, AntiAiRule } from "@ai-novel/shared/types/styleEngine";
import { CheckCircle2, Edit3, FileText, Plus, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";
import {
  createAntiAiRule,
  generateAntiAiRuleDraft,
  getAntiAiRules,
  getEffectiveAntiAiRules,
  getStyleProfiles,
  updateAntiAiRule,
} from "@/api/styleEngine";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type RuleFilter = "all" | "global" | "style" | "disabled";

interface RuleFormState {
  key: string;
  name: string;
  type: AntiAiRule["type"];
  severity: AntiAiRule["severity"];
  description: string;
  detectPatternsText: string;
  promptInstruction: string;
  rewriteSuggestion: string;
  enabled: boolean;
  globalBaselineEnabled: boolean;
  autoRewrite: boolean;
}

const emptyForm: RuleFormState = {
  key: "",
  name: "",
  type: "risk",
  severity: "medium",
  description: "",
  detectPatternsText: "",
  promptInstruction: "",
  rewriteSuggestion: "",
  enabled: true,
  globalBaselineEnabled: false,
  autoRewrite: false,
};

const typeLabels: Record<AntiAiRule["type"], string> = {
  forbidden: "禁用",
  risk: "风险",
  encourage: "鼓励",
};

const severityLabels: Record<AntiAiRule["severity"], string> = {
  low: "低",
  medium: "中",
  high: "高",
};

function ruleToForm(rule: AntiAiRule): RuleFormState {
  return {
    key: rule.key,
    name: rule.name,
    type: rule.type,
    severity: rule.severity,
    description: rule.description,
    detectPatternsText: rule.detectPatterns.join("\n"),
    promptInstruction: rule.promptInstruction ?? "",
    rewriteSuggestion: rule.rewriteSuggestion ?? "",
    enabled: rule.enabled,
    globalBaselineEnabled: rule.globalBaselineEnabled,
    autoRewrite: rule.autoRewrite,
  };
}

function parsePatternText(value: string): string[] {
  return value
    .split(/[\n,，;；]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildPayload(form: RuleFormState) {
  return {
    key: form.key.trim(),
    name: form.name.trim(),
    type: form.type,
    severity: form.severity,
    description: form.description.trim(),
    detectPatterns: parsePatternText(form.detectPatternsText),
    promptInstruction: form.promptInstruction.trim() || undefined,
    rewriteSuggestion: form.rewriteSuggestion.trim() || undefined,
    enabled: form.enabled,
    globalBaselineEnabled: form.globalBaselineEnabled,
    autoRewrite: form.autoRewrite,
  };
}

function buildEffectiveParamsKey(styleProfileId: string) {
  return new URLSearchParams(styleProfileId ? { styleProfileId } : {}).toString() || "global";
}

function StatTile(props: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="text-xs font-medium text-muted-foreground">{props.label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{props.value}</div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">{props.hint}</div>
    </div>
  );
}

function ToggleLine(props: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  title?: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
      <span className="min-w-0 text-muted-foreground">{props.label}</span>
      <Switch
        checked={props.checked}
        disabled={props.disabled}
        title={props.title ?? props.label}
        onCheckedChange={props.onCheckedChange}
      />
    </label>
  );
}

function EffectiveRuleList(props: { title: string; rules: AntiAiEffectiveRuleItem[]; empty: string }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-foreground">{props.title}</div>
      {props.rules.length > 0 ? (
        <div className="space-y-2">
          {props.rules.map((item) => (
            <div key={`${item.source}-${item.rule.id}`} className="rounded-md border bg-background p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium text-foreground">{item.rule.name}</div>
                <Badge variant={item.source === "global_baseline" ? "default" : "secondary"}>
                  {item.source === "global_baseline" ? "全局默认" : "写法规则"}
                </Badge>
                <Badge variant="outline">{typeLabels[item.rule.type]} / {severityLabels[item.rule.severity]}</Badge>
              </div>
              <div className="mt-2 text-xs leading-5 text-muted-foreground">
                {item.sourceLabel}{item.weight !== 1 ? `，强度 ${item.weight}` : ""}
              </div>
              {item.rule.promptInstruction ? (
                <div className="mt-2 text-sm leading-6 text-muted-foreground">{item.rule.promptInstruction}</div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{props.empty}</div>
      )}
    </div>
  );
}

export default function AntiAiRulesPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<RuleFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AntiAiRule | null>(null);
  const [form, setForm] = useState<RuleFormState>(emptyForm);
  const [aiInstruction, setAiInstruction] = useState("");
  const [previewStyleProfileId, setPreviewStyleProfileId] = useState("");

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
      toast.success("反 AI 规则已创建。");
      setDialogOpen(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "创建规则失败。"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<ReturnType<typeof buildPayload>> }) => updateAntiAiRule(id, payload),
    onSuccess: async () => {
      await refreshRules();
      toast.success("反 AI 规则已保存。");
      setDialogOpen(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "保存规则失败。"),
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
        toast.error("AI 没有返回可用草稿。");
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
      toast.success("草稿填入表单，请检查后保存。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "AI 生成草稿失败。"),
  });

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
      toast.error("请填写规则标识、名称和说明。");
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

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isAiDrafting = aiDraftMutation.isPending;

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
        <CardContent className="grid gap-3 md:grid-cols-4">
          <StatTile label="规则总数" value={stats.total} hint="规则库中可查看和编辑的全部规则。" />
          <StatTile label="启用规则" value={stats.enabled} hint="会参与全局或写法绑定解析的规则。" />
          <StatTile label="全局默认" value={stats.global} hint="不绑定写法时也会进入正文生成。" />
          <StatTile label="自动改写" value={stats.autoRewrite} hint="检测命中后可进入改写建议链路。" />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-xl">规则列表</CardTitle>
                <CardDescription>快速启停规则、调整全局默认、维护生成指令和修正建议。</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  ["all", "全部"],
                  ["global", "全局默认"],
                  ["style", "写法专属可用"],
                  ["disabled", "已停用"],
                ].map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={filter === value ? "default" : "outline"}
                    onClick={() => setFilter(value as RuleFilter)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {rulesQuery.isLoading ? (
              <div className="text-sm text-muted-foreground">正在加载反 AI 规则...</div>
            ) : null}
            {!rulesQuery.isLoading && filteredRules.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                当前筛选下没有规则。
              </div>
            ) : null}
            {filteredRules.map((rule) => (
              <div key={rule.id} className={cn("rounded-lg border p-4", !rule.enabled && "bg-muted/30 opacity-80")}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-base font-semibold text-foreground">{rule.name}</div>
                      <Badge variant={rule.enabled ? "secondary" : "outline"}>{rule.enabled ? "启用" : "停用"}</Badge>
                      {rule.globalBaselineEnabled ? <Badge>全局默认</Badge> : <Badge variant="outline">可绑定</Badge>}
                      <Badge variant="outline">{typeLabels[rule.type]} / {severityLabels[rule.severity]}</Badge>
                    </div>
                    <div className="mt-2 text-sm leading-6 text-muted-foreground">{rule.description}</div>
                    {rule.detectPatterns.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {rule.detectPatterns.slice(0, 8).map((pattern) => (
                          <Badge key={`${rule.id}-${pattern}`} variant="outline">{pattern}</Badge>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                      <div className="rounded-md border bg-muted/20 p-3">
                        <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <FileText className="h-3.5 w-3.5" />
                          生成指令
                        </div>
                        <div className="leading-6 text-foreground">{rule.promptInstruction || "未填写"}</div>
                      </div>
                      <div className="rounded-md border bg-muted/20 p-3">
                        <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          修正建议
                        </div>
                        <div className="leading-6 text-foreground">{rule.rewriteSuggestion || "未填写"}</div>
                      </div>
                    </div>
                  </div>
                  <div className="grid min-w-[210px] gap-2">
                    <ToggleLine
                      label="启用"
                      checked={rule.enabled}
                      disabled={isSaving}
                      onCheckedChange={(checked) => handleQuickToggle(rule, "enabled", checked)}
                    />
                    <ToggleLine
                      label="全局默认"
                      checked={rule.globalBaselineEnabled}
                      disabled={isSaving}
                      onCheckedChange={(checked) => handleQuickToggle(rule, "globalBaselineEnabled", checked)}
                    />
                    <ToggleLine
                      label="自动改写"
                      checked={rule.autoRewrite}
                      disabled={isSaving}
                      onCheckedChange={(checked) => handleQuickToggle(rule, "autoRewrite", checked)}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => openEditDialog(rule)}>
                      <Edit3 className="h-4 w-4" />
                      编辑
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <SlidersHorizontal className="h-5 w-5" />
              生效预览
            </CardTitle>
            <CardDescription>
              查看正文生成会拿到的全局规则，以及选中写法后叠加的专属规则。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              value={previewStyleProfileId || "__global__"}
              onValueChange={(value) => setPreviewStyleProfileId(value === "__global__" ? "" : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择预览上下文" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__global__">只看全局默认</SelectItem>
                {profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {effectiveQuery.isLoading ? (
              <div className="text-sm text-muted-foreground">正在计算生效规则...</div>
            ) : null}

            {effective ? (
              <div className="space-y-4">
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <div className="rounded-md border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">全局基线</div>
                    <div className="mt-1 font-semibold">{effective.usesGlobalAntiAiBaseline ? "应用" : "未应用"}</div>
                  </div>
                  <div className="rounded-md border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">生效规则</div>
                    <div className="mt-1 font-semibold">{effective.effectiveRules.length}</div>
                  </div>
                </div>
                <EffectiveRuleList
                  title="全局默认规则"
                  rules={effective.globalBaselineRules}
                  empty="没有全局默认规则。"
                />
                <EffectiveRuleList
                  title="写法专属规则"
                  rules={effective.styleSpecificRules}
                  empty="当前预览没有叠加写法专属规则。"
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AppDialogContent
          className="max-w-4xl"
          title={editingRule ? "编辑反 AI 规则" : "新建反 AI 规则"}
          description="规则可以进入全局默认，也可以只作为写法资产的可选约束。"
          footer={(
            <>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button type="submit" form="anti-ai-rule-form" disabled={isSaving}>
                {isSaving ? "保存中..." : "保存规则"}
              </Button>
            </>
          )}
        >
          <form id="anti-ai-rule-form" className="space-y-4" onSubmit={handleSubmit}>
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Sparkles className="h-4 w-4" />
                    AI 辅助
                  </div>
                  <div className="text-sm leading-6 text-muted-foreground">
                    {editingRule
                      ? "描述要调整的方向，AI 会基于当前表单优化规则内容。"
                      : "描述想压制或鼓励的表达，AI 会生成一条可编辑规则草稿。"}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!aiInstruction.trim() || isAiDrafting}
                  onClick={() => aiDraftMutation.mutate()}
                >
                  <Sparkles className="h-4 w-4" />
                  {isAiDrafting ? "生成中..." : editingRule ? "AI 优化草稿" : "AI 生成草稿"}
                </Button>
              </div>
              <textarea
                className="mt-3 min-h-[84px] w-full rounded-md border bg-background p-3 text-sm"
                value={aiInstruction}
                placeholder={editingRule
                  ? "例如：把这条规则改得更适合压制总结腔，但不要误伤正常心理描写。"
                  : "例如：减少正文里那种空泛总结、解释人物心理、像模型在复盘剧情的表达。"}
                onChange={(event) => setAiInstruction(event.target.value)}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">规则标识</span>
                <Input
                  value={form.key}
                  placeholder="例如 direct_psychology_explain"
                  onChange={(event) => setForm((prev) => ({ ...prev, key: event.target.value }))}
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">规则名称</span>
                <Input
                  value={form.name}
                  placeholder="例如 避免直白心理解释"
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">规则类型</span>
                <Select value={form.type} onValueChange={(value) => setForm((prev) => ({ ...prev, type: value as AntiAiRule["type"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="forbidden">禁用</SelectItem>
                    <SelectItem value="risk">风险</SelectItem>
                    <SelectItem value="encourage">鼓励</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">严重度</span>
                <Select value={form.severity} onValueChange={(value) => setForm((prev) => ({ ...prev, severity: value as AntiAiRule["severity"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">低</SelectItem>
                    <SelectItem value="medium">中</SelectItem>
                    <SelectItem value="high">高</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </div>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium">说明</span>
              <textarea
                className="min-h-[76px] w-full rounded-md border bg-background p-3 text-sm"
                value={form.description}
                placeholder="说明这条规则要压制或鼓励哪类表达。"
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium">检测关键词</span>
              <textarea
                className="min-h-[80px] w-full rounded-md border bg-background p-3 text-sm"
                value={form.detectPatternsText}
                placeholder="每行一个关键词，也可以用逗号分隔。"
                onChange={(event) => setForm((prev) => ({ ...prev, detectPatternsText: event.target.value }))}
              />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">生成指令</span>
                <textarea
                  className="min-h-[120px] w-full rounded-md border bg-background p-3 text-sm"
                  value={form.promptInstruction}
                  placeholder="写进正文生成约束的具体表达要求。"
                  onChange={(event) => setForm((prev) => ({ ...prev, promptInstruction: event.target.value }))}
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">修正建议</span>
                <textarea
                  className="min-h-[120px] w-full rounded-md border bg-background p-3 text-sm"
                  value={form.rewriteSuggestion}
                  placeholder="检测命中后给用户或改写链路的调整建议。"
                  onChange={(event) => setForm((prev) => ({ ...prev, rewriteSuggestion: event.target.value }))}
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <ToggleLine
                label="启用规则"
                checked={form.enabled}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, enabled: checked }))}
              />
              <ToggleLine
                label="进入全局默认"
                checked={form.globalBaselineEnabled}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, globalBaselineEnabled: checked }))}
              />
              <ToggleLine
                label="允许自动改写"
                checked={form.autoRewrite}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, autoRewrite: checked }))}
              />
            </div>
          </form>
        </AppDialogContent>
      </Dialog>
    </div>
  );
}
