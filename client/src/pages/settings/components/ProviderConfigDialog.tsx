import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { Dispatch, SetStateAction } from "react";
import type { APIKeyStatus } from "@/api/settings";
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
  const primaryModelLabel = isCreatingCustomProvider ? t("gen.pages.settings.components.ProviderConfigDialog.gen_4a007d89") : isCustomDialog ? t("gen.pages.settings.components.ProviderConfigDialog.gen_b11de232") : t("gen.pages.settings.components.ProviderConfigDialog.gen_920fe38e");
  const canSelectListedModels = selectableModels.length > 0;
  const imageModelOptions = editingConfig?.imageModels ?? [];
  const canSelectImageModels = imageModelOptions.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        className="max-w-lg"
        title={isCreatingCustomProvider ? t("gen.pages.settings.components.ProviderConfigDialog.gen_86fc689e") : isCustomDialog ? t("gen.pages.settings.components.ProviderConfigDialog.gen_c45a36b0") : t("gen.pages.settings.components.ProviderConfigDialog.gen_1efc6243")}
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
        <div className="space-y-3">
          {isCustomDialog ? (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">{t("gen.pages.settings.components.ProviderConfigDialog.gen_99b8ee4c")}</div>
              <Input
                value={form.displayName}
                placeholder={t("gen.pages.settings.components.ProviderConfigDialog.exampleMyModelGateway")}
                onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
              />
            </div>
          ) : null}

          {(isCustomDialog || editingConfig?.requiresApiKey === false) ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              API Key 可以留空；填写 API 地址后可获取模型列表，系统会选择一个默认模型。
            </div>
          ) : null}

          <Input
            type="password"
            value={form.key}
            placeholder={editingConfig?.isConfigured ? t("gen.pages.settings.components.ProviderConfigDialog.gen_3cca094e") : t("gen.pages.settings.components.ProviderConfigDialog.gen_0d3afff6")}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, key: event.target.value }));
              if (isCreatingCustomProvider) {
                onClearPreviewModels();
              }
            }}
          />

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">{t("gen.pages.settings.components.ProviderConfigDialog.apiAddress")}</div>
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
                ? t("gen.pages.settings.components.ProviderConfigDialog.gen_708d0597")
                : t("gen.pages.settings.components.ProviderConfigDialog.gen_51a13d4e")}
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
                {isPreviewingModels ? t("gen.pages.settings.components.ProviderConfigDialog.gen_4a8d5ce9") : t("gen.pages.settings.components.ProviderConfigDialog.gen_4162141a")}
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
              <div className="text-xs text-muted-foreground">{t("gen.pages.settings.components.ProviderConfigDialog.gen_13388721")}</div>
              <SearchableSelect
                value={form.model}
                onValueChange={(value) => setForm((prev) => ({ ...prev, model: value }))}
                options={selectableModels.map((model) => ({ value: model }))}
                placeholder={t("gen.pages.settings.components.ProviderConfigDialog.gen_f2d3731b")}
                searchPlaceholder={t("gen.pages.settings.components.ProviderConfigDialog.gen_8288a2e8")}
                emptyText={t("gen.pages.settings.components.ProviderConfigDialog.gen_039e58de")}
              />
            </div>
          ) : null}

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">{primaryModelLabel}</div>
            <div className="text-xs text-muted-foreground">
              {isCreatingCustomProvider
                ? t("gen.pages.settings.components.ProviderConfigDialog.gen_12876110")
                : editingConfig?.kind === "custom" && !canSelectListedModels
                  ? t("gen.pages.settings.components.ProviderConfigDialog.gen_c13f114c")
                  : t("gen.pages.settings.components.ProviderConfigDialog.gen_877547cd")}
            </div>
          </div>
          <Input
            value={form.model}
            placeholder={t("gen.pages.settings.components.ProviderConfigDialog.directManualInputModelName")}
            onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))}
          />

          <div className="space-y-3 rounded-md border bg-muted/20 p-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">{t("gen.pages.settings.components.ProviderConfigDialog.gen_c5948a6a")}</div>
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
                  placeholder={t("gen.pages.settings.components.ProviderConfigDialog.gen_5a7af023")}
                  searchPlaceholder={t("gen.pages.settings.components.ProviderConfigDialog.gen_53f93fc3")}
                  emptyText={t("gen.pages.settings.components.ProviderConfigDialog.gen_3c12a8fc")}
                />
              </div>
            ) : null}
            <Input
              value={form.imageModel}
              placeholder={editingConfig?.defaultImageModel ?? t("gen.pages.settings.components.ProviderConfigDialog.gen_6155a156")}
              onChange={(event) => setForm((prev) => ({ ...prev, imageModel: event.target.value }))}
            />
            <div className="text-xs text-muted-foreground">
              图片生成会调用这个厂商的 OpenAI 兼容图像接口。
            </div>
          </div>

          <ProviderRequestLimitFields
            concurrencyLimit={form.concurrencyLimit}
            requestIntervalMs={form.requestIntervalMs}
            onChange={(value) => setForm((prev) => ({ ...prev, ...value }))}
          />

          {testResult ? <div className="break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{testResult}</div> : null}
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
