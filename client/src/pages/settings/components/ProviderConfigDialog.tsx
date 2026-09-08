import type { Dispatch, SetStateAction } from "react";
import { Bot, Image, KeyRound, Link2, SlidersHorizontal } from "lucide-react";
import type { APIKeyStatus } from "@/api/settings";
import type { ProviderAuthMode } from "@ai-novel/shared/types/llm";
import SearchableSelect from "@/components/common/SearchableSelect";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import ProviderRequestLimitFields from "./ProviderRequestLimitFields";

export interface ProviderFormState {
  displayName: string;
  key: string;
  model: string;
  imageModel: string;
  baseURL: string;
  authMode: ProviderAuthMode;
  concurrencyLimit: string;
  requestIntervalMs: string;
}

interface ProviderConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isCreatingCustomProvider: boolean;
  isCustomDialog: boolean;
  editingConfig?: APIKeyStatus;
  form: ProviderFormState;
  setForm: Dispatch<SetStateAction<ProviderFormState>>;
  selectableModels: string[];
  previewModelsResult: string;
  isPreviewingModels: boolean;
  onClearPreviewModels: () => void;
  onPreviewModels: () => void;
  onSubmit: () => void;
  submitDisabled: boolean;
  submitLabel: string;
  onTest: () => void;
  testDisabled: boolean;
  testResult: string;
  onDeleteCustomProvider: () => void;
  deleteDisabled: boolean;
  deleteLabel: string;
}

export default function ProviderConfigDialog({
  open,
  onOpenChange,
  isCreatingCustomProvider,
  isCustomDialog,
  editingConfig,
  form,
  setForm,
  selectableModels,
  previewModelsResult,
  isPreviewingModels,
  onClearPreviewModels,
  onPreviewModels,
  onSubmit,
  submitDisabled,
  submitLabel,
  onTest,
  testDisabled,
  testResult,
  onDeleteCustomProvider,
  deleteDisabled,
  deleteLabel,
}: ProviderConfigDialogProps) {
  const primaryModelLabel = isCreatingCustomProvider ? "默认模型（可选）" : isCustomDialog ? "默认模型" : "模型名称";
  const canSelectListedModels = selectableModels.length > 0;
  const imageModelOptions = editingConfig?.imageModels ?? [];
  const canSelectImageModels = imageModelOptions.length > 0;
  const modelGuidance = editingConfig?.provider === "deepseek"
    ? "推荐使用 DeepSeek V4 Flash，兼顾中文长篇质量与响应速度；也可以选择其他可用模型。"
    : isCreatingCustomProvider
      ? "获取模型列表后会自动填入第一个可用模型；接口不返回列表时，可以手动填写。"
      : editingConfig?.kind === "custom" && !canSelectListedModels
        ? "可点击厂商卡片的“刷新模型”获取列表，也可以手动填写默认模型。"
        : "如果列表里没有目标模型，可以手动输入。";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        className="max-w-lg"
        title={isCreatingCustomProvider ? "新增自定义厂商" : isCustomDialog ? "编辑自定义厂商" : "配置模型厂商"}
        footer={(
          <>
            <Button className="w-full sm:w-auto" onClick={onSubmit} disabled={submitDisabled}>
              {submitLabel}
            </Button>

            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={onTest}
              disabled={testDisabled}
            >
              测试连接
            </Button>

            {editingConfig?.kind === "custom" ? (
              <Button
                variant="destructive"
                className="w-full sm:w-auto"
                onClick={onDeleteCustomProvider}
                disabled={deleteDisabled}
              >
                {deleteLabel}
              </Button>
            ) : null}
          </>
        )}
        footerClassName="gap-2"
      >
        <div className="space-y-5">
          {isCustomDialog ? (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">厂商名称</div>
              <Input
                value={form.displayName}
                placeholder="例如：我的模型网关"
                onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
              />
            </div>
          ) : null}

          {(isCustomDialog || editingConfig?.requiresApiKey === false) ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              API Key 可以留空；填写 API 地址后可获取模型列表，系统会选择一个默认模型。
            </div>
          ) : null}

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><KeyRound className="h-3.5 w-3.5" /> API Key</div>
            <Input
              type="password"
              value={form.key}
              placeholder={editingConfig?.isConfigured ? "留空则沿用保存的 API Key" : "输入 API Key"}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, key: event.target.value }));
                if (isCreatingCustomProvider) {
                  onClearPreviewModels();
                }
              }}
            />
          </div>

          {isCustomDialog ? (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">鉴权方式</div>
              <SearchableSelect
                value={form.authMode}
                onValueChange={(value) => setForm((prev) => ({
                  ...prev,
                  authMode: value as ProviderAuthMode,
                }))}
                options={[
                  { value: "bearer", label: "Authorization: Bearer" },
                  { value: "x-api-key", label: "x-api-key" },
                  { value: "none", label: "无需鉴权" },
                ]}
                placeholder="选择鉴权方式"
              />
              <div className="text-xs text-muted-foreground">
                按第三方接口文档选择；大多数 OpenAI 兼容接口使用 Authorization: Bearer。
              </div>
            </div>
          ) : null}

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Link2 className="h-3.5 w-3.5" /> API 地址</div>
            <Input
              value={form.baseURL}
              placeholder={editingConfig?.defaultBaseURL ?? "https://api.example.com/v1"}
              onChange={(event) => {
                setForm((prev) => ({
                  ...prev,
                  baseURL: event.target.value,
                  model: isCreatingCustomProvider ? "" : prev.model,
                }));
                if (isCreatingCustomProvider) {
                  onClearPreviewModels();
                }
              }}
            />
            <div className="text-xs text-muted-foreground">
              {isCreatingCustomProvider
                ? "填写 OpenAI 兼容 API 地址，通常以 /v1 结尾；本地 Ollama 常见地址是 http://127.0.0.1:11434/v1。"
                : "留空会使用默认地址；本地 Ollama 常见地址是 http://127.0.0.1:11434/v1。"}
            </div>
          </div>

          {isCreatingCustomProvider ? (
            <div className="space-y-2">
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={onPreviewModels}
                disabled={isPreviewingModels || !form.baseURL.trim()}
              >
                {isPreviewingModels ? "获取中..." : "获取模型列表"}
              </Button>
              {previewModelsResult ? (
                <div className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                  {previewModelsResult}
                </div>
              ) : null}
            </div>
          ) : null}

          {canSelectListedModels ? (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">可用模型</div>
              <SearchableSelect
                value={form.model}
                onValueChange={(value) => setForm((prev) => ({ ...prev, model: value }))}
                options={selectableModels.map((model) => ({ value: model }))}
                placeholder="选择模型"
                searchPlaceholder="搜索模型"
                emptyText="没有可用模型"
              />
            </div>
          ) : null}

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Bot className="h-3.5 w-3.5" /> {primaryModelLabel}</div>
            <div className="text-xs text-muted-foreground">{modelGuidance}</div>
          </div>
          <Input
            value={form.model}
            placeholder="也可以直接手动输入模型名"
            onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))}
          />

          <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Image className="h-3.5 w-3.5" /> 图像模型（可选）</div>
              <div className="text-xs text-muted-foreground">
                填写后，角色形象图生成可以选择这个厂商；留空则只用于文本模型。
              </div>
            </div>
            {canSelectImageModels ? (
              <div className="space-y-1">
                <SearchableSelect
                  value={form.imageModel}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, imageModel: value }))}
                  options={imageModelOptions.map((model) => ({ value: model }))}
                  placeholder="选择图像模型"
                  searchPlaceholder="搜索图像模型"
                  emptyText="没有可用的图像模型"
                />
              </div>
            ) : null}
            <Input
              value={form.imageModel}
              placeholder={editingConfig?.defaultImageModel ?? "输入图像模型名"}
              onChange={(event) => setForm((prev) => ({ ...prev, imageModel: event.target.value }))}
            />
            <div className="text-xs text-muted-foreground">
              图片生成会调用这个厂商的 OpenAI 兼容图像接口。
            </div>
          </div>

          <div className="rounded-xl border border-dashed bg-muted/10 p-4">
            <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><SlidersHorizontal className="h-3.5 w-3.5" /> 请求限制</div>
            <ProviderRequestLimitFields
              concurrencyLimit={form.concurrencyLimit}
              requestIntervalMs={form.requestIntervalMs}
              onChange={(value) => setForm((prev) => ({ ...prev, ...value }))}
            />
          </div>

          {testResult ? <div className="break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{testResult}</div> : null}
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
