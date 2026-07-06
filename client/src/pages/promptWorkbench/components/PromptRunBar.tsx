import { Eye, RotateCcw, Save } from "lucide-react";
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
  onGeneratePreview: () => void;
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
    onReset,
    onSave,
    previewDisabled,
    prompt,
    resetDisabled,
    saveDisabled,
    saveError,
  } = props;
  const maxBudget = prompt?.contextPolicy.maxTokensBudget ?? null;

  return (
    <div className="shrink-0 border-t bg-background/95 px-5 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div>
            <span className="text-xs text-muted-foreground">上下文估算</span>
            <div className="font-semibold">
              {estimatedTokens ?? "--"}
              {maxBudget ? <span className="ml-1 text-xs font-normal text-muted-foreground">/ {maxBudget}</span> : null}
            </div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">模型配置</span>
            <div className="font-semibold">按提示词路由</div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">保存状态</span>
            <div className={cn(
              "font-semibold",
              saveError ? "text-destructive" : isSaveSuccess ? "text-emerald-700" : "text-foreground",
            )}>
              {saveError ? "保存失败" : isSaveSuccess ? "已保存" : dirtyCount > 0 ? `${dirtyCount} 个未保存` : "无未保存修改"}
            </div>
          </div>
          {saveError ? <div className="text-xs text-destructive">{saveError}</div> : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onGeneratePreview}
            disabled={previewDisabled || isPreviewPending}
          >
            <Eye className="mr-2 h-4 w-4" />
            {isPreviewPending ? "预览中..." : "生成预览"}
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={saveDisabled || isSavePending}
          >
            <Save className="mr-2 h-4 w-4" />
            {isSavePending ? "保存中..." : "保存覆盖"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onReset}
            disabled={resetDisabled}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            重置修改
          </Button>
        </div>
      </div>
    </div>
  );
}
