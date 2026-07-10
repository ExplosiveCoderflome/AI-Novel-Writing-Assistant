import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { Eye, RotateCcw, Save, ShieldCheck } from "lucide-react";
import type { PromptCatalogItem } from "@/api/promptWorkbench";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PromptRunBarProps {
  prompt: PromptCatalogItem | null;
  estimatedTokens: number | null;
  dirtyCount: number;
  isPreviewPending: boolean;
  isSavePending: boolean;
  isSaveSuccess: boolean;
  saveError?: string | null;
  saveDisabled: boolean;
  previewDisabled: boolean;
  resetDisabled: boolean;
  officialVersionDisabled?: boolean;
  officialVersionLabel?: string;
  saveLabel?: string;
  savePendingLabel?: string;
  onGeneratePreview: () => void;
  onOpenOfficialVersion: () => void;
  onSave: () => void;
  onReset: () => void;
}

export function PromptRunBar(props: PromptRunBarProps) {
  const {
    dirtyCount,
    estimatedTokens,
    isPreviewPending,
    isSavePending,
    isSaveSuccess,
    onGeneratePreview,
    onOpenOfficialVersion,
    onReset,
    onSave,
    officialVersionDisabled,
    officialVersionLabel = t("gen.pages.promptWorkbench.components.PromptRunBar.gen_0bda51e1"),
    previewDisabled,
    prompt,
    resetDisabled,
    saveDisabled,
    saveError,
    saveLabel = t("gen.pages.promptWorkbench.components.PromptRunBar.saveOverlay"),
    savePendingLabel = t("gen.pages.promptWorkbench.components.PromptRunBar.savingInProgressDotDotDot"),
  } = props;
  const maxBudget = prompt?.contextPolicy.maxTokensBudget ?? null;

  return (
    <div className="shrink-0 border-t border-[#d8e2de] bg-[#fbfdfb]/95 px-5 py-3 backdrop-blur">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <div className="rounded-md bg-[#f2f8f6] px-3 py-2">
            <span className="text-xs text-muted-foreground">{t("gen.pages.promptWorkbench.components.PromptRunBar.gen_55b09bd2")}</span>
            <div className="font-semibold text-[#25443f]">
              {estimatedTokens ?? "--"}
              {maxBudget ? <span className="ml-1 text-xs font-normal text-muted-foreground">/ {maxBudget}</span> : null}
            </div>
          </div>
          <div className="rounded-md bg-[#f4f7ff] px-3 py-2">
            <span className="text-xs text-muted-foreground">{t("gen.pages.promptWorkbench.components.PromptRunBar.gen_73cbcf30")}</span>
            <div className="font-semibold text-[#344d7a]">{t("gen.pages.promptWorkbench.components.PromptRunBar.gen_02e8cdac")}</div>
          </div>
          <div className="rounded-md bg-[#fff7e8] px-3 py-2">
            <span className="text-xs text-muted-foreground">{t("gen.pages.promptWorkbench.components.PromptRunBar.saveStatus")}</span>
            <div className={cn(
              "font-semibold",
              saveError ? "text-destructive" : isSaveSuccess ? "text-[#0f766e]" : "text-[#7a5620]",
            )}>
              {saveError ? t("gen.pages.promptWorkbench.components.PromptRunBar.saveFailed") : isSaveSuccess ? t("gen.pages.promptWorkbench.components.PromptRunBar.gen_f8dfedcd") : dirtyCount > 0 ? `${dirtyCount} 个未保存` : t("gen.pages.promptWorkbench.components.PromptRunBar.gen_371acd99")}
            </div>
          </div>
          {saveError ? <div className="text-xs text-destructive">{saveError}</div> : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onOpenOfficialVersion}
            disabled={officialVersionDisabled}
            className="border-[#b8d9d0] bg-white text-[#0f5f59] hover:bg-[#eaf7f2] hover:text-[#0f5f59]"
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            {officialVersionLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onGeneratePreview}
            disabled={previewDisabled || isPreviewPending}
            className="border-[#b8d9d0] bg-white text-[#0f5f59] hover:bg-[#eaf7f2] hover:text-[#0f5f59]"
          >
            <Eye className="mr-2 h-4 w-4" />
            {isPreviewPending ? t("gen.pages.promptWorkbench.components.PromptRunBar.gen_6dcec2a1") : t("gen.pages.promptWorkbench.components.PromptRunBar.gen_b542b0a0")}
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={saveDisabled || isSavePending}
            className="bg-[#0f766e] text-white hover:bg-[#0b5f59]"
          >
            <Save className="mr-2 h-4 w-4" />
            {isSavePending ? savePendingLabel : saveLabel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onReset}
            disabled={resetDisabled}
            className="text-[#52606d] hover:bg-[#eef4ff] hover:text-[#344d7a]"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            重置修改
          </Button>
        </div>
      </div>
    </div>
  );
}
