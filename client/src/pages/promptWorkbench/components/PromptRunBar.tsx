import { useState } from "react";
import { Eye, FlaskConical, RotateCcw, Save, ShieldCheck } from "lucide-react";
import type { PromptCatalogItem } from "@/api/promptWorkbench";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import LLMSelector, { type LLMSelectorValue } from "@/components/common/LLMSelector";
import { cn } from "@/lib/utils";

interface PromptRunBarProps {
  prompt: PromptCatalogItem | null;
  estimatedTokens: number | null;
  dirtyCount: number;
  isPreviewPending: boolean;
  isTestRunPending?: boolean;
  isSavePending: boolean;
  isSaveSuccess: boolean;
  saveError?: string | null;
  saveDisabled: boolean;
  previewDisabled: boolean;
  testRunDisabled?: boolean;
  testLlm: LLMSelectorValue;
  onTestLlmChange: (value: LLMSelectorValue) => void;
  resetDisabled: boolean;
  officialVersionDisabled?: boolean;
  officialVersionLabel?: string;
  saveLabel?: string;
  savePendingLabel?: string;
  onGeneratePreview: () => void;
  onRunTest: () => void;
  onOpenOfficialVersion: () => void;
  onSave: () => void;
  onReset: () => void;
  writingLab?: boolean;
}

export function PromptRunBar(props: PromptRunBarProps) {
  const {
    dirtyCount,
    estimatedTokens,
    isPreviewPending,
    isTestRunPending,
    isSavePending,
    isSaveSuccess,
    onGeneratePreview,
    onOpenOfficialVersion,
    onReset,
    onRunTest,
    onSave,
    officialVersionDisabled,
    officialVersionLabel = "官方版本",
    previewDisabled,
    prompt,
    resetDisabled,
    saveDisabled,
    saveError,
    saveLabel = "保存覆盖",
    savePendingLabel = "保存中...",
    testLlm,
    onTestLlmChange,
    testRunDisabled,
    writingLab = false,
  } = props;
  const maxBudget = prompt?.contextPolicy.maxTokensBudget ?? null;
  const [testDialogOpen, setTestDialogOpen] = useState(false);

  function handleStartTestRun() {
    onRunTest();
    setTestDialogOpen(false);
  }

  return (
    <div className="shrink-0 border-t border-border bg-card/95 px-5 py-3 backdrop-blur">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          {!writingLab ? <div className="rounded-md bg-muted px-3 py-2">
            <span className="text-xs text-muted-foreground">上下文估算</span>
            <div className="font-semibold text-foreground">
              {estimatedTokens ?? "--"}
              {maxBudget ? <span className="ml-1 text-xs font-normal text-muted-foreground">/ {maxBudget}</span> : null}
            </div>
          </div> : null}
          {!writingLab ? <div className="rounded-md bg-info/10 px-3 py-2">
            <span className="text-xs text-muted-foreground">测试模型</span>
            <div className="font-semibold text-info">可选覆盖</div>
          </div> : null}
          <div className="rounded-md bg-warning/10 px-3 py-2">
            <span className="text-xs text-muted-foreground">保存状态</span>
            <div className={cn(
              "font-semibold",
              saveError ? "text-destructive" : isSaveSuccess ? "text-success" : "text-warning",
            )}>
              {saveError ? "保存失败" : isSaveSuccess ? "已保存" : dirtyCount > 0 ? `${dirtyCount} 个未保存` : "无未保存修改"}
            </div>
          </div>
          {saveError ? <div className="text-xs text-destructive">{saveError}</div> : null}
        </div>

        <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onOpenOfficialVersion}
            disabled={officialVersionDisabled}
            className="border-primary/40 bg-card text-primary hover:bg-primary/10 hover:text-primary"
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            {officialVersionLabel}
          </Button>
          {!writingLab ? <Button
            type="button"
            variant="outline"
            onClick={onGeneratePreview}
            disabled={previewDisabled || isPreviewPending}
            className="border-primary/40 bg-card text-primary hover:bg-primary/10 hover:text-primary"
          >
            <Eye className="mr-2 h-4 w-4" />
            {isPreviewPending ? "预览中..." : "生成预览"}
          </Button> : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => setTestDialogOpen(true)}
            disabled={testRunDisabled || isTestRunPending}
            className="border-warning/50 bg-card text-warning hover:bg-warning/10 hover:text-warning"
          >
            <FlaskConical className="mr-2 h-4 w-4" />
            {isTestRunPending ? "试写中..." : writingLab ? "试写效果" : "测试产出"}
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={saveDisabled || isSavePending}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Save className="mr-2 h-4 w-4" />
            {isSavePending ? savePendingLabel : saveLabel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onReset}
            disabled={resetDisabled}
            className="text-muted-foreground hover:bg-info/10 hover:text-info"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            重置修改
          </Button>
        </div>
      </div>
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <AppDialogContent
          title={writingLab ? "试写效果" : "测试产出"}
          description={writingLab
            ? "使用当前小说、章节和未保存模板试写一次，不会改动章节正文。"
            : "选择本次测试使用的模型参数，系统会用当前未保存草稿生成一次结果。"}
          className="prompt-workbench-theme max-w-2xl"
          bodyClassName="bg-card"
          footer={(
            <>
              <Button type="button" variant="ghost" onClick={() => setTestDialogOpen(false)}>
                取消
              </Button>
              <Button
                type="button"
                onClick={handleStartTestRun}
                disabled={testRunDisabled || isTestRunPending}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <FlaskConical className="mr-2 h-4 w-4" />
                {isTestRunPending ? "试写中..." : writingLab ? "开始试写" : "开始测试"}
              </Button>
            </>
          )}
        >
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-card p-4">
              <LLMSelector
                value={testLlm}
                onChange={onTestLlmChange}
                showBadge={false}
                showParameters
              />
            </div>
            <div className="rounded-md bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
              {writingLab
                ? "试写会调用真实模型并消耗额度，结果仅用于比较模板效果，不会保存为章节正文。"
                : "测试产出会调用真实模型并消耗额度；结果只用于调试，不会保存为章节正文。"}
            </div>
          </div>
        </AppDialogContent>
      </Dialog>
    </div>
  );
}
