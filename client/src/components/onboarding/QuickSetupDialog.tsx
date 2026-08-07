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

interface QuickSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: QuickSetupStatus | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
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
  if (provider.id === "deepseek") return "A low-threshold option for Chinese long-form planning and writing";
  if (provider.id === "ollama") return "Use native model, no API Key required";
  if (provider.id === "openai") return "Suitable for general planning, text and structured tasks";
  return provider.configured ? "Already configured, you can directly detect and set it as global default" : "After configuration, it can be used for the entire novel production chain";
}

export default function QuickSetupDialog(props: QuickSetupDialogProps) {
  const queryClient = useQueryClient();
  const llmStore = useLLMStore();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<SetupForm>(EMPTY_FORM);
  const [customModels, setCustomModels] = useState<string[]>([]);
  const [customModelsMessage, setCustomModelsMessage] = useState("");

  const selectedProvider = useMemo(
    () => props.status?.providers.find((provider) => provider.id === form.provider) ?? null,
    [form.provider, props.status?.providers],
  );
  const modelOptions = form.providerKind === "custom"
    ? customModels
    : selectedProvider?.models ?? [];

  useEffect(() => {
    if (!props.open || form.provider || !props.status) {
      return;
    }
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
  }, [form.provider, props.open, props.status]);

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
      setCustomModelsMessage(models.length > 0 ? `找到 ${models.length} 个可用模型。` : "The interface does not return a model list and can be filled in manually.");
      setForm((current) => ({ ...current, model: current.model.trim() || models[0] || "" }));
    },
    onError: (error) => {
      setCustomModels([]);
      setCustomModelsMessage(error instanceof Error ? error.message : "Failed to obtain the model list. You can manually fill in the model name.");
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

  const chooseCustom = () => {
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

  const footer = props.loading || props.error || props.status?.readyForCreation
    ? null
    : step === 1
      ? (
          <Button onClick={() => setStep(2)} disabled={!canContinueProvider}>
            Fill in the connection information <ArrowRight className="h-4 w-4" />
          </Button>
        )
      : step === 2
        ? (
            <>
              <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" /> Return to selection</Button>
              <Button onClick={submit} disabled={!canSubmit}>Detect and complete configuration <PlugZap className="h-4 w-4" /></Button>
            </>
          )
        : completeMutation.isSuccess
          ? (
              <>
                <Button variant="outline" asChild><Link to="/settings">View advanced settings</Link></Button>
                <Button onClick={() => props.onOpenChange(false)}>Start creating <Sparkles className="h-4 w-4" /></Button>
              </>
            )
          : completeMutation.isError
            ? (
                <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4" /> Modify configuration</Button>
              )
            : null;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent
        className="max-w-3xl"
        title="Let the AI ​​creation environment run first"
        description="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
        footer={footer}
        footerClassName="gap-2"
      >
        <div className="mb-6 grid grid-cols-3 gap-2">
          {[
            { index: 1, label: "Select manufacturer" },
            { index: 2, label: "Connection model" },
            { index: 3, label: "Test completed" },
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
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Checking the creative environment
                                </div>
        ) : props.error ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-4 text-center">
            <CircleAlert className="h-9 w-9 text-amber-600" />
            <div>
              <div className="font-semibold">The model configuration cannot be read at the moment</div>
              <div className="mt-1 text-sm text-muted-foreground">After reloading, the system will continue to determine whether it can start creating.</div>
            </div>
            <Button variant="outline" onClick={props.onRetry}>Reload</Button>
          </div>
        ) : props.status?.readyForCreation && !completeMutation.isSuccess ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-4 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            <div>
              <div className="text-lg font-semibold">The creative environment can be used</div>
              <div className="mt-2 text-sm text-muted-foreground">
                {props.status.selectedProvider} · {props.status.selectedModel}，{props.status.routeCoverage.total} All core tasks are ready.
                                                    </div>
            </div>
            <Button onClick={() => props.onOpenChange(false)}>Keep creating</Button>
          </div>
        ) : step === 1 ? (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold">Select the manufacturer for which you already have an account or interface</h3>
              <p className="mt-1 text-sm text-muted-foreground">Only select one for the first time, and you can still add more manufacturers in the system settings later.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {props.status?.providers.map((provider) => (
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
                    {provider.configured ? <Badge variant="outline">Existing configuration</Badge> : null}
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">Recommended model:{provider.currentModel || provider.defaultModel}</div>
                </button>
              ))}
              <button
                type="button"
                className={cn(
                  "rounded-xl border border-dashed p-4 text-left transition hover:border-primary/50 hover:bg-primary/5",
                  form.providerKind === "custom" && !form.provider && "border-primary bg-primary/5 ring-1 ring-primary/20",
                )}
                onClick={chooseCustom}
              >
                <div className="flex items-center gap-2 font-semibold"><ServerCog className="h-4 w-4" /> Custom compatible interface</div>
                <div className="mt-2 text-xs leading-5 text-muted-foreground">Suitable for transit services, local gateways, or other OpenAI compatible addresses.</div>
              </button>
            </div>
          </div>
        ) : step === 2 ? (
          <div className="space-y-5">
            <div>
              <h3 className="font-semibold">connect {form.providerKind === "custom" ? form.customProviderName || "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." : selectedProvider?.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">API Key will only be saved to the local or server-side key storage and will not be displayed in the completion results.</p>
            </div>
            {form.providerKind === "custom" ? (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Manufacturer name</span>
                <Input value={form.customProviderName} placeholder="For example: my model gateway" onChange={(event) => setForm((current) => ({ ...current, customProviderName: event.target.value }))} />
              </label>
            ) : null}
            <label className="block space-y-1.5">
              <span className="flex items-center gap-2 text-sm font-medium"><KeyRound className="h-4 w-4" /> API Key {requiresApiKey ? "" : "（Optional）"}</span>
              <Input
                type="password"
                autoComplete="off"
                value={form.apiKey}
                placeholder={hasSavedKey ? "Leave blank to continue using the saved Key" : requiresApiKey ? "Enter API Key" : "Local interface can be left blank"}
                onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">API address</span>
              <Input value={form.baseURL} placeholder="https://api.example.com/v1" onChange={(event) => setForm((current) => ({ ...current, baseURL: event.target.value }))} />
            </label>
            {form.providerKind === "custom" ? (
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" size="sm" onClick={() => previewMutation.mutate()} disabled={!form.baseURL.trim() || previewMutation.isPending}>
                  {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ServerCog className="h-4 w-4" />}
                  Get model list
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
              <span className="text-sm font-medium">text model</span>
              <Input value={form.model} placeholder="Select the model above, or directly fill in the model name" onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} />
            </label>
            <div className="rounded-lg border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
              Once completed, this model serves as the initial default for core tasks such as planning, writing, reviewing, fixing, replanning, and summarizing.
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
                  <div className="text-lg font-semibold">Detecting plain text vs structured output</div>
                  <div className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">After passing the test, the system will automatically prepare all core creation tasks, and there is no need to configure routing one by one.</div>
                </div>
              </>
            ) : completeMutation.isSuccess ? (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle2 className="h-8 w-8 text-emerald-700" />
                </div>
                <div>
                  <div className="text-lg font-semibold">Creative environment configuration completed</div>
                  <div className="mt-2 text-sm text-muted-foreground">{completeMutation.data.data?.model} Already available for the entire novel production chain.</div>
                </div>
              </>
            ) : (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
                  <CircleAlert className="h-8 w-8 text-amber-700" />
                </div>
                <div>
                  <div className="text-lg font-semibold">Model detection failed</div>
                  <div className="mt-2 max-w-lg text-sm leading-6 text-destructive">
                    {completeMutation.error instanceof Error ? completeMutation.error.message : "Please check the API Key, address, and model name and try again."}
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
