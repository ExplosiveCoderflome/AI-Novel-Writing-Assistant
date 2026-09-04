import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  KeyRound,
  Loader2,
  PlugZap,
  ServerCog,
  Sparkles,
} from "lucide-react";
import type {
  CompleteQuickSetupRequest,
  QuickSetupProviderOption,
  QuickSetupStatus,
} from "@ai-novel/shared/types/onboarding";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { completeQuickSetup } from "@/api/onboarding";
import { previewCustomProviderModels } from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLLMStore } from "@/store/llmStore";
import {
  shouldInitializeProviderSelection,
  shouldShowFirstNovelHandoff,
} from "./creationSetupState";

interface QuickSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: QuickSetupStatus | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  forceConfiguration?: boolean;
}

interface SetupForm {
  providerKind: "builtin" | "custom";
  provider: LLMProvider | "";
  customProviderName: string;
  apiKey: string;
  baseURL: string;
  model: string;
}

const EMPTY_FORM: SetupForm = {
  providerKind: "builtin",
  provider: "",
  customProviderName: "",
  apiKey: "",
  baseURL: "",
  model: "",
};

function providerDescription(provider: QuickSetupProviderOption): string {
  if (provider.id === "deepseek") return "推荐 DeepSeek V4 Flash，兼顾中文长篇质量与响应速度";
  if (provider.id === "ollama") return "使用本机模型，不要求 API Key";
  if (provider.id === "openai") return "适合通用规划、正文与结构化任务";
  return provider.configured ? "已有配置，可以直接检测并设为全局默认" : "配置后可用于整条小说生产链";
}

export default function QuickSetupDialog(props: QuickSetupDialogProps) {
  const queryClient = useQueryClient();
  const llmStore = useLLMStore();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<SetupForm>(EMPTY_FORM);
  const [customModels, setCustomModels] = useState<string[]>([]);
  const [customModelsMessage, setCustomModelsMessage] = useState("");
  const [showAllProviderChoices, setShowAllProviderChoices] = useState(false);

  useEffect(() => {
    if (props.open && props.forceConfiguration) {
      setStep(1);
    }
  }, [props.forceConfiguration, props.open]);

  const selectedProvider = useMemo(
    () => props.status?.providers.find((provider) => provider.id === form.provider) ?? null,
    [form.provider, props.status?.providers],
  );
  const recommendedProvider = useMemo(
    () => props.status?.providers.find((provider) => provider.id === props.status?.selectedProvider)
      ?? props.status?.providers.find((provider) => provider.id === "deepseek")
      ?? props.status?.providers[0]
      ?? null,
    [props.status?.providers, props.status?.selectedProvider],
  );
  const preferredProvider = selectedProvider ?? recommendedProvider;
  const providerChoices: QuickSetupProviderOption[] = showAllProviderChoices
    ? props.status?.providers ?? []
    : preferredProvider ? [preferredProvider] : [];
  const modelOptions = form.providerKind === "custom"
    ? customModels
    : selectedProvider?.models ?? [];

  useEffect(() => {
    if (!shouldInitializeProviderSelection({
      open: props.open,
      statusAvailable: Boolean(props.status),
      providerKind: form.providerKind,
      provider: form.provider,
    })) {
      return;
    }
    if (!props.status) return;
    const preferred = props.status.providers.find(
      (provider) => provider.id === props.status?.selectedProvider,
    ) ?? props.status.providers.find((provider) => provider.id === "deepseek")
      ?? props.status.providers[0];
    if (!preferred) return;
    setForm({
      providerKind: preferred.kind,
      provider: preferred.id,
      customProviderName: preferred.kind === "custom" ? preferred.name : "",
      apiKey: "",
      baseURL: preferred.currentBaseURL || preferred.defaultBaseURL,
      model: preferred.currentModel || preferred.defaultModel,
    });
  }, [form.provider, form.providerKind, props.open, props.status]);

  const completeMutation = useMutation({
    mutationFn: (payload: CompleteQuickSetupRequest) => completeQuickSetup(payload),
    onSuccess: async (response) => {
      if (response.data) {
        llmStore.setSelection({
          provider: response.data.provider,
          model: response.data.model,
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.quickSetup }),
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.apiKeys }),
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.llmSelection }),
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.modelRoutes }),
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.modelRouteConnectivity }),
        queryClient.invalidateQueries({ queryKey: queryKeys.onboarding.firstNovel }),
      ]);
    },
  });

  const previewMutation = useMutation({
    mutationFn: () => previewCustomProviderModels({
      key: form.apiKey.trim() || undefined,
      baseURL: form.baseURL.trim(),
    }),
    onSuccess: (response) => {
      const models = response.data?.models ?? [];
      setCustomModels(models);
      setCustomModelsMessage(models.length > 0 ? `找到 ${models.length} 个可用模型。` : "接口没有返回模型列表，可以手动填写。");
      setForm((current) => ({ ...current, model: current.model.trim() || models[0] || "" }));
    },
    onError: (error) => {
      setCustomModels([]);
      setCustomModelsMessage(error instanceof Error ? error.message : "获取模型列表失败，可以手动填写模型名称。");
    },
  });

  const chooseProvider = (provider: QuickSetupProviderOption) => {
    setForm({
      providerKind: provider.kind,
      provider: provider.id,
      customProviderName: provider.kind === "custom" ? provider.name : "",
      apiKey: "",
      baseURL: provider.currentBaseURL || provider.defaultBaseURL,
      model: provider.currentModel || provider.defaultModel,
    });
    setCustomModels([]);
    setCustomModelsMessage("");
  };

  const chooseCustom = (continueToConnection = false) => {
    setForm({
      providerKind: "custom",
      provider: "",
      customProviderName: "",
      apiKey: "",
      baseURL: "",
      model: "",
    });
    setCustomModels([]);
    setCustomModelsMessage("");
    setShowAllProviderChoices(false);
    if (continueToConnection) {
      setStep(2);
    }
  };

  const canContinueProvider = form.providerKind === "custom" || Boolean(form.provider);
  const requiresApiKey = form.providerKind === "builtin" && selectedProvider?.requiresApiKey !== false;
  const hasSavedKey = selectedProvider?.configured === true;
  const canSubmit = Boolean(
    form.model.trim()
    && form.baseURL.trim()
    && (form.providerKind === "builtin" ? form.provider : form.customProviderName.trim())
    && (!requiresApiKey || form.apiKey.trim() || hasSavedKey),
  );
  const showFirstNovelHandoff = shouldShowFirstNovelHandoff({
    configurationSucceeded: completeMutation.isSuccess,
    forceConfiguration: props.forceConfiguration === true,
  });

  const submit = () => {
    setStep(3);
    completeMutation.mutate({
      providerKind: form.providerKind,
      ...(form.provider ? { provider: form.provider } : {}),
      ...(form.providerKind === "custom" ? { customProviderName: form.customProviderName.trim() } : {}),
      ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
      baseURL: form.baseURL.trim(),
      model: form.model.trim(),
    });
  };

  const footer = props.loading || props.error || (props.status?.readyForCreation && !props.forceConfiguration)
    ? null
    : step === 1
      ? (
          <Button onClick={() => setStep(2)} disabled={!canContinueProvider}>
            填写连接信息 <ArrowRight className="h-4 w-4" />
          </Button>
        )
      : step === 2
        ? (
            <>
              <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" /> 返回选择</Button>
              <Button onClick={submit} disabled={!canSubmit}>检测并完成配置 <PlugZap className="h-4 w-4" /></Button>
            </>
          )
        : completeMutation.isSuccess
          ? (
              showFirstNovelHandoff
                ? (
                    <>
                      <Button variant="outline" asChild><Link to="/help">查看创作向导</Link></Button>
                      <Button asChild><Link to="/novels/auto-director">用一句话开始第一本小说 <ArrowRight className="h-4 w-4" /></Link></Button>
                    </>
                  )
                : (
                    <>
                      <Button variant="outline" asChild><Link to="/settings">查看高级设置</Link></Button>
                      <Button onClick={() => props.onOpenChange(false)}>开始创作 <Sparkles className="h-4 w-4" /></Button>
                    </>
                  )
            )
          : completeMutation.isError
            ? (
                <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4" /> 修改配置</Button>
              )
            : null;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent
        className="max-w-3xl"
        title="让 AI 创作环境先跑起来"
        description="只配置一个文本模型，系统会自动准备规划、正文、审校和修复所需的任务路由。"
        footer={footer}
        footerClassName="gap-2"
      >
        <div className="mb-6 grid grid-cols-3 gap-2">
          {[
            { index: 1, label: "选择厂商" },
            { index: 2, label: "连接模型" },
            { index: 3, label: "检测完成" },
          ].map((item) => (
            <div key={item.index} className={cn(
              "rounded-lg border px-3 py-2 text-xs",
              step === item.index ? "border-primary bg-primary/5 text-primary" : step > item.index ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "text-muted-foreground",
            )}>
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full border text-[11px]">
                  {step > item.index ? <Check className="h-3 w-3" /> : item.index}
                </span>
                {item.label}
              </div>
            </div>
          ))}
        </div>

        {props.loading ? (
          <div className="flex min-h-56 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 正在检查创作环境
          </div>
        ) : props.error ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-4 text-center">
            <CircleAlert className="h-9 w-9 text-amber-600" />
            <div>
              <div className="font-semibold">暂时无法读取模型配置</div>
              <div className="mt-1 text-sm text-muted-foreground">重新加载后，系统会继续判断是否可以开始创作。</div>
            </div>
            <Button variant="outline" onClick={props.onRetry}>重新加载</Button>
          </div>
        ) : props.status?.readyForCreation && !props.forceConfiguration && !completeMutation.isSuccess ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-4 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            <div>
              <div className="text-lg font-semibold">创作环境可以使用</div>
              <div className="mt-2 text-sm text-muted-foreground">
                {props.status.selectedProvider} · {props.status.selectedModel}，{props.status.routeCoverage.total} 类核心任务均已就绪。
              </div>
            </div>
            <Button onClick={() => props.onOpenChange(false)}>继续创作</Button>
          </div>
        ) : step === 1 ? (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold">{showAllProviderChoices ? "选择一个内置模型厂商" : "从推荐方案开始"}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {showAllProviderChoices
                  ? "选择一个厂商后，再填写连接信息。"
                  : "先配置一个文本模型即可开始创作；需要时再选择其他厂商。"}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {providerChoices.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  className={cn(
                    "rounded-xl border p-4 text-left transition hover:border-primary/50 hover:bg-primary/5",
                    form.provider === provider.id && "border-primary bg-primary/5 ring-1 ring-primary/20",
                  )}
                  onClick={() => chooseProvider(provider)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{provider.name}</div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">{providerDescription(provider)}</div>
                    </div>
                    {form.provider === provider.id
                      ? <Badge>已选择</Badge>
                      : provider.configured ? <Badge variant="outline">已有配置</Badge> : null}
                  </div>
                <div className="mt-3 text-xs text-muted-foreground">推荐模型：{provider.currentModel || provider.defaultModel}</div>
              </button>
              ))}
              {!showAllProviderChoices ? (
                <button
                  type="button"
                  className="rounded-xl border border-dashed p-4 text-left transition hover:border-primary/50 hover:bg-primary/5"
                  onClick={() => setShowAllProviderChoices(true)}
                >
                  <div className="flex items-center gap-2 font-semibold"><PlugZap className="h-4 w-4" /> 查看全部内置厂商</div>
                  <div className="mt-2 text-xs leading-5 text-muted-foreground">选择你已有账号的厂商，再继续填写连接信息。</div>
                </button>
              ) : null}
              <button
                type="button"
                className={cn(
                  "rounded-xl border border-dashed p-4 text-left transition hover:border-primary/50 hover:bg-primary/5",
                  form.providerKind === "custom" && !form.provider && "border-primary bg-primary/5 ring-1 ring-primary/20",
                )}
                onClick={() => chooseCustom(true)}
              >
                <div className="flex items-center gap-2 font-semibold"><ServerCog className="h-4 w-4" /> 添加第三方厂商 <ArrowRight className="h-4 w-4" /></div>
                <div className="mt-2 text-xs leading-5 text-muted-foreground">新增一份独立的厂商配置，适合中转服务、本地网关或 OpenAI 兼容接口。</div>
              </button>
            </div>
            {showAllProviderChoices ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAllProviderChoices(false)}>
                <ArrowLeft className="h-4 w-4" /> 返回推荐方案
              </Button>
            ) : null}
          </div>
        ) : step === 2 ? (
          <div className="space-y-5">
            <div>
              <h3 className="font-semibold">{form.providerKind === "custom" ? "添加第三方厂商" : `连接 ${selectedProvider?.name ?? "模型厂商"}`}</h3>
              <p className="mt-1 text-sm text-muted-foreground">API Key 只会保存到本机或服务端密钥存储，不会显示在完成结果中。</p>
              {form.providerKind === "custom" ? (
                <p className="mt-1 text-xs text-muted-foreground">厂商名称、API 地址和模型将保存为独立配置，不会覆盖已有内置厂商。</p>
              ) : null}
            </div>
            {form.providerKind === "custom" ? (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">厂商名称</span>
                <Input value={form.customProviderName} placeholder="例如：我的模型网关" onChange={(event) => setForm((current) => ({ ...current, customProviderName: event.target.value }))} />
              </label>
            ) : null}
            <label className="block space-y-1.5">
              <span className="flex items-center gap-2 text-sm font-medium"><KeyRound className="h-4 w-4" /> API Key {requiresApiKey ? "" : "（可选）"}</span>
              <Input
                type="password"
                autoComplete="off"
                value={form.apiKey}
                placeholder={hasSavedKey ? "留空则继续使用已保存的 Key" : requiresApiKey ? "输入 API Key" : "本地接口可以留空"}
                onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">API 地址</span>
              <Input value={form.baseURL} placeholder="https://api.example.com/v1" onChange={(event) => setForm((current) => ({ ...current, baseURL: event.target.value }))} />
            </label>
            {form.providerKind === "custom" ? (
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" size="sm" onClick={() => previewMutation.mutate()} disabled={!form.baseURL.trim() || previewMutation.isPending}>
                  {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ServerCog className="h-4 w-4" />}
                  获取模型列表
                </Button>
                {customModelsMessage ? <span className="text-xs text-muted-foreground">{customModelsMessage}</span> : null}
              </div>
            ) : null}
            {modelOptions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {modelOptions.slice(0, 8).map((model) => (
                  <button
                    key={model}
                    type="button"
                    className={cn("rounded-full border px-3 py-1.5 text-xs", form.model === model && "border-primary bg-primary/10 text-primary")}
                    onClick={() => setForm((current) => ({ ...current, model }))}
                  >
                    {model}
                  </button>
                ))}
              </div>
            ) : null}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">文本模型</span>
              <Input value={form.model} placeholder="选择上方模型，或直接填写模型名称" onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} />
            </label>
            <div className="rounded-lg border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
              完成后，这个模型会作为规划、正文、审核、修复、重规划和摘要等核心任务的初始默认值。
            </div>
          </div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center gap-4 text-center">
            {completeMutation.isPending ? (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                </div>
                <div>
                  <div className="text-lg font-semibold">正在检测普通文本与结构化输出</div>
                  <div className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">检测通过后，系统会自动准备全部核心创作任务，不需要逐项配置路由。</div>
                </div>
              </>
            ) : completeMutation.isSuccess ? (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle2 className="h-8 w-8 text-emerald-700" />
                </div>
                <div>
                  <div className="text-lg font-semibold">创作环境配置完成</div>
                  <div className="mt-2 text-sm text-muted-foreground">{completeMutation.data.data?.model} 已可用于整条小说生产链。</div>
                </div>
                {showFirstNovelHandoff ? (
                  <div className="w-full max-w-xl rounded-2xl border border-primary/15 bg-primary/[0.035] p-5 text-left shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-primary">开始第一本小说</div>
                      <Link to="/settings" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">配置更多模型</Link>
                    </div>
                    <h3 className="mt-2 text-xl font-semibold tracking-tight">从一句想写的故事开始</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">告诉 AI 你想写什么，它会先给出可选方向；选定后继续准备故事、世界、角色和首章。</p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      {["说想法", "选择方向", "阅读首章"].map((label, index) => (
                        <div key={label} className="rounded-xl border bg-background/80 px-3 py-2.5 text-sm font-medium">
                          <span className="mr-2 text-primary">{index + 1}</span>{label}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
                  <CircleAlert className="h-8 w-8 text-amber-700" />
                </div>
                <div>
                  <div className="text-lg font-semibold">模型检测没有通过</div>
                  <div className="mt-2 max-w-lg text-sm leading-6 text-destructive">
                    {completeMutation.error instanceof Error ? completeMutation.error.message : "请检查 API Key、地址和模型名称后重试。"}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </AppDialogContent>
    </Dialog>
  );
}
