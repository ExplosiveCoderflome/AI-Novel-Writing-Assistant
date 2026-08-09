import { useTranslation } from "react-i18next";
import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { BookOpen, GitBranch, Settings2, Sparkles } from "lucide-react";
import LLMSelector from "@/components/common/LLMSelector";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";
import type { NovelBasicFormState } from "../novelBasicInfo.shared";

interface StageModelRunProps {
  basicForm: NovelBasicFormState;
  onBasicFormChange: (patch: Partial<NovelBasicFormState>) => void;
  canGenerate: boolean;
  isGenerating: boolean;
  onBack: () => void;
  onGenerate: () => void;
}

export default function StageModelRun({
  basicForm,
  onBasicFormChange,
  canGenerate,
  isGenerating,
  onBack,
  onGenerate,
}: StageModelRunProps) {
  const { t } = useTranslation();
  return (
    <section className="mx-auto w-full max-w-5xl space-y-7 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-2xl font-semibold tracking-normal text-foreground">{i18next.t("gen.pages.novels.autoDirector.StageModelRun.gen_6bf313d0", "确认模型与生产准备")}</div>
          <div className={`mt-2 max-w-2xl text-sm leading-6 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{i18next.t("gen.pages.novels.autoDirector.StageModelRun.gen_1242e965", "确认后，AI 会先给出两套整书方向，再自动完成开写前的角色和卷章准备。")}</div>
        </div>
        <div className="rounded-full bg-muted/55 px-3 py-1 text-xs text-muted-foreground">{i18next.t("gen.pages.novels.autoDirector.StageModelRun.gen_b53d3ca1", "启动前最后一步")}</div>
      </div>

      <div className="space-y-6">
        <section className="overflow-hidden rounded-2xl border border-border/70 bg-background shadow-[0_20px_55px_-45px_hsl(var(--foreground)/0.5)]">
          <div className="border-b border-border/60 bg-muted/15 px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <GitBranch className="h-4 w-4 text-primary" />{i18next.t("gen.pages.novels.autoDirector.StageModelRun.gen_bc58dd1f", "自动导演会这样推进")}</div>
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
              <div className="mt-1 text-xs leading-5 text-muted-foreground">{i18next.t("gen.pages.novels.autoDirector.StageModelRun.gen_b079e44b", "系统完成角色、卷战略、拆章和章节执行资源。")}</div>
            </div>
            <div className="bg-background p-5">
              <Settings2 className="h-5 w-5 text-primary" />
              <div className="mt-3 text-sm font-semibold text-foreground">3. 选择正文生产方式</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">{i18next.t("gen.pages.novels.autoDirector.StageModelRun.gen_8df92c88", "简易创作由 AI 写完整本书；专业创作进入完整工作台。")}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary/10 bg-primary/[0.05] px-5 py-3 text-xs">
            <span className="font-medium text-foreground">{i18next.t("gen.pages.novels.autoDirector.StageModelRun.gen_c7a8a71e", "正文会停在开写前等待你的选择")}</span>
            <span className="text-muted-foreground">{i18next.t("gen.pages.novels.autoDirector.StageModelRun.gen_1db3b088", "不会提前生成章节正文")}</span>
          </div>
        </section>

        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">{i18next.t("gen.pages.novels.autoDirector.StageModelRun.gen_9c8d9efd")}</div>
            <div className={`text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{i18next.t("gen.pages.novels.autoDirector.StageModelRun.gen_c4d8ff2b", "开启后，章节正文生成完成时会检测 AI 味风险，并在命中可修正问题时生成修订稿。")}</div>
          </div>
          <Switch
            aria-label={i18next.t("gen.pages.novels.autoDirector.StageModelRun.gen_9c8d9efd")}
            checked={basicForm.postGenerationStyleReviewEnabled}
            onCheckedChange={(checked) => onBasicFormChange({ postGenerationStyleReviewEnabled: checked })}
          />
        </div>

        <details className="group rounded-2xl border border-border/70 bg-background px-5 py-4">
          <summary className="cursor-pointer list-none">
            <div className="text-sm font-medium text-foreground">{i18next.t("gen.pages.novels.autoDirector.StageModelRun.gen_96467e71")}</div>
            <div className={`mt-1 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{i18next.t("gen.pages.novels.autoDirector.StageModelRun.gen_a73469dd", "默认使用顶部已选模型；需要临时换模型时再展开调整。")}</div>
          </summary>
          <div className="mt-4">
            <LLMSelector />
          </div>
        </details>
      </div>

      <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>{i18next.t("gen.pages.novels.autoDirector.StageModelRun.gen_1272a114")}</Button>
        <Button type="button" onClick={onGenerate} disabled={!canGenerate}>
          {isGenerating ? i18next.t("gen.pages.novels.autoDirector.StageModelRun.gen_4d020ba3") : i18next.t("gen.pages.novels.autoDirector.StageModelRun.gen_b21c2a02")}
        </Button>
      </div>
    </section>
  );
}
