import { BookOpen, GitBranch, Settings2, Sparkles } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import LLMSelector from "@/components/common/LLMSelector";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";
import type { NovelBasicFormState } from "../novelBasicInfo.shared";
import { findDirectorIssuePolicyPreset, type DirectorIssuePolicy } from "@ai-novel/shared/types/directorIssue";
import { AutoDirectorIssuePolicyCard } from "@/pages/settings/AutoDirectorIssuePolicyCard";

interface StageModelRunProps {
  basicForm: NovelBasicFormState;
  onBasicFormChange: (patch: Partial<NovelBasicFormState>) => void;
  canGenerate: boolean;
  isGenerating: boolean;
  onBack: () => void;
  onGenerate: () => void;
  issuePolicy?: DirectorIssuePolicy | null;
  issuePolicyLoading: boolean;
  onIssuePolicyChange: (policy: DirectorIssuePolicy) => void;
}

export default function StageModelRun({
  basicForm,
  onBasicFormChange,
  canGenerate,
  isGenerating,
  onBack,
  onGenerate,
  issuePolicy,
  issuePolicyLoading,
  onIssuePolicyChange,
}: StageModelRunProps) {
  const [issuePolicyDialogOpen, setIssuePolicyDialogOpen] = useState(false);
  const issuePolicySummary = issuePolicy
    ? findDirectorIssuePolicyPreset(issuePolicy)?.name ?? "已调整本次开书规则"
    : "使用默认规则";

  return (
    <section className="mx-auto w-full max-w-5xl space-y-7 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-2xl font-semibold tracking-normal text-foreground">确认模型与生产准备</div>
          <div className={`mt-2 max-w-2xl text-sm leading-6 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            确认后，AI 会先给出两套整书方向，再自动完成开写前的角色和卷章准备。
          </div>
        </div>
        <div className="rounded-full bg-muted/55 px-3 py-1 text-xs text-muted-foreground">
          启动前最后一步
        </div>
      </div>

      <div className="space-y-6">
        <section className="overflow-hidden rounded-2xl border border-border/70 bg-background shadow-[0_20px_55px_-45px_hsl(var(--foreground)/0.5)]">
          <div className="border-b border-border/60 bg-muted/15 px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <GitBranch className="h-4 w-4 text-primary" />
              自动导演会这样推进
            </div>
          </div>
          <div className="grid gap-px bg-border/60 md:grid-cols-3">
            <div className="bg-background p-5">
              <Sparkles className="h-5 w-5 text-primary" />
              <div className="mt-3 text-sm font-semibold text-foreground">1. 选择整书方向</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">AI 生成两套差异明确的方向，由你二选一。</div>
            </div>
            <div className="bg-background p-5">
              <BookOpen className="h-5 w-5 text-primary" />
              <div className="mt-3 text-sm font-semibold text-foreground">2. 自动准备到可开写</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">系统完成角色、卷战略、拆章和章节执行资源。</div>
            </div>
            <div className="bg-background p-5">
              <Settings2 className="h-5 w-5 text-primary" />
              <div className="mt-3 text-sm font-semibold text-foreground">3. 选择正文生产方式</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">简易创作由 AI 写完整本书；专业创作进入完整工作台。</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary/10 bg-primary/[0.05] px-5 py-3 text-xs">
            <span className="font-medium text-foreground">正文会停在开写前等待你的选择</span>
            <span className="text-muted-foreground">不会提前生成章节正文</span>
          </div>
        </section>

        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">正文后去 AI 检测与修正</div>
            <div className={`text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              开启后，章节正文生成完成时会检测 AI 味风险，并在命中可修正问题时生成修订稿。
            </div>
          </div>
          <Switch
            aria-label="正文后去 AI 检测与修正"
            checked={basicForm.postGenerationStyleReviewEnabled}
            onCheckedChange={(checked) => onBasicFormChange({ postGenerationStyleReviewEnabled: checked })}
          />
        </div>

        <details className="group rounded-2xl border border-border/70 bg-background px-5 py-4">
          <summary className="cursor-pointer list-none">
            <div className="text-sm font-medium text-foreground">模型设置</div>
            <div className={`mt-1 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              调整本次开书使用的模型、温度与输出上限。结构规划建议将温度保持在 0.3～0.7。
            </div>
          </summary>
          <div className="mt-4">
            <LLMSelector showParameters />
          </div>
        </details>

        <section className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium text-foreground">本书问题管理</div>
            <div className={`mt-1 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              {issuePolicyLoading ? "正在读取默认规则。" : `${issuePolicySummary}；不调整也可以直接开书。`}
            </div>
          </div>
          <Button type="button" variant="outline" className="shrink-0" onClick={() => setIssuePolicyDialogOpen(true)}>
            <Settings2 className="mr-2 h-4 w-4" />
            本书问题管理
          </Button>
        </section>

        <Dialog open={issuePolicyDialogOpen} onOpenChange={setIssuePolicyDialogOpen}>
          <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>本书问题管理</DialogTitle>
              <DialogDescription>开书前确认这本书遇到问题时的处理方式；不调整即可沿用默认规则。</DialogDescription>
            </DialogHeader>
            <AutoDirectorIssuePolicyCard
              policy={issuePolicy}
              isLoading={issuePolicyLoading}
              isSaving={false}
              onSave={(policy) => {
                onIssuePolicyChange(policy);
                setIssuePolicyDialogOpen(false);
              }}
              saveButtonLabel="应用到本书开书任务"
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>返回世界与写法</Button>
        <Button type="button" onClick={onGenerate} disabled={!canGenerate}>
          {isGenerating ? "生成中..." : "开始生成方向"}
        </Button>
      </div>
    </section>
  );
}
