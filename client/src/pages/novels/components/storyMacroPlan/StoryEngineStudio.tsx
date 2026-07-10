import { AlertTriangle, ArrowRight, CheckCircle2, Compass, FileText, Flame, GitBranch, Lock, Sparkles, Target } from "lucide-react";
import AiButton from "@/components/common/AiButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StoryMacroField } from "@ai-novel/shared/types/storyMacro";
import type { StoryMacroTabProps } from "../NovelEditView.types";
import {
  FieldActions,
  SUMMARY_FIELDS,
  listToText,
  textareaClassName,
} from "../StoryMacroPlanTab.shared";

interface StoryEngineStudioProps {
  tab: StoryMacroTabProps;
}

const readinessItems = [
  { key: "storyInput", label: "故事意图", icon: <FileText className="h-3.5 w-3.5" /> },
  { key: "sellingPoint", label: "卖点", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { key: "conflict", label: "长期对立", icon: <Flame className="h-3.5 w-3.5" /> },
  { key: "hook", label: "主线钩子", icon: <Target className="h-3.5 w-3.5" /> },
  { key: "loop", label: "推进回路", icon: <GitBranch className="h-3.5 w-3.5" /> },
] as const;

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function previewText(value: string, fallback: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return fallback;
  }
  return normalized.length > 92 ? `${normalized.slice(0, 92)}...` : normalized;
}

function resolveNextAction(tab: StoryMacroTabProps): {
  title: string;
  description: string;
  tone: "neutral" | "info" | "success" | "warning";
} {
  if (!tab.storyInput.trim()) {
    return {
      title: "先写下故事想法",
      description: "不用写专业大纲，先说明主角处境、长期压力、想要的读者感受和想避免的方向。",
      tone: "warning",
    };
  }
  if (!tab.hasPlan) {
    return {
      title: "生成故事引擎",
      description: "让 AI 把想法拆成卖点、长期对立、主线钩子、推进回路和关键兑现点。",
      tone: "info",
    };
  }
  if (!tab.constraintEngine) {
    return {
      title: "构建约束引擎",
      description: "把已确认的故事骨架整理成后续角色、卷规划和章节生成都能遵守的硬边界。",
      tone: "info",
    };
  }
  return {
    title: "进入下游规划前先保存",
    description: "当前故事骨架已经具备可消费的约束，保存后可以继续推进角色、卷战略和拆章。",
    tone: "success",
  };
}

function StoryReadinessPanel({ tab }: { tab: StoryMacroTabProps }) {
  const readiness = {
    storyInput: hasText(tab.storyInput),
    sellingPoint: hasText(tab.decomposition.selling_point),
    conflict: hasText(tab.decomposition.core_conflict),
    hook: hasText(tab.decomposition.main_hook),
    loop: hasText(tab.decomposition.progression_loop),
  };
  const readyCount = readinessItems.filter((item) => readiness[item.key]).length;
  const percent = Math.round((readyCount / readinessItems.length) * 100);
  const lockedCount = Object.values(tab.lockedFields).filter(Boolean).length;
  const nextAction = resolveNextAction(tab);

  return (
    <aside className="space-y-4 rounded-lg border border-border/70 bg-muted/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">宏观规划就绪度</div>
          <div className="mt-1 text-xs text-muted-foreground">{readyCount} / {readinessItems.length} 个核心条件已具备</div>
        </div>
        <div className="text-2xl font-semibold text-foreground">{percent}%</div>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>

      <div className="rounded-lg border border-border/60 bg-background/85 p-3">
        {readinessItems.map((item) => (
          <div key={item.key} className="grid grid-cols-[1.5rem,1fr,auto] items-center gap-3 border-t border-border/55 py-3 first:border-t-0 first:pt-0 last:pb-0">
            <div className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md",
              readiness[item.key] ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground",
            )}>
              {item.icon}
            </div>
            <div className="text-sm text-foreground">{item.label}</div>
            {readiness[item.key] ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <span className="text-xs text-muted-foreground">待补</span>
            )}
          </div>
        ))}
      </div>

      <div className={cn(
        "rounded-lg border p-3",
        nextAction.tone === "success" && "border-emerald-500/20 bg-emerald-500/10",
        nextAction.tone === "warning" && "border-amber-500/25 bg-amber-500/10",
        nextAction.tone === "info" && "border-primary/20 bg-primary/5",
        nextAction.tone === "neutral" && "border-border/60 bg-background/85",
      )}>
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Compass className="h-4 w-4 text-primary" />
          {nextAction.title}
        </div>
        <div className="mt-2 text-xs leading-5 text-muted-foreground">{nextAction.description}</div>
      </div>

      <div className="grid gap-2 text-xs text-muted-foreground">
        <div className="flex items-start gap-2 rounded-md bg-background/70 p-2">
          <Lock className="mt-0.5 h-3.5 w-3.5 text-primary" />
          <span>{lockedCount > 0 ? `${lockedCount} 个字段已锁定，重生成时会被保护。` : "确认满意的字段后可以锁定，再让 AI 只重生成其他部分。"}</span>
        </div>
        <div className="flex items-start gap-2 rounded-md bg-background/70 p-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-amber-600" />
          <span>{tab.issues.length > 0 ? `${tab.issues.length} 条冲突或缺口需要处理。` : "当前没有显式冲突提醒。"}</span>
        </div>
      </div>
    </aside>
  );
}

function SummaryFieldCard({ tab, field }: { tab: StoryMacroTabProps; field: StoryMacroField }) {
  const item = SUMMARY_FIELDS.find((candidate) => candidate.field === field);
  if (!item) {
    return null;
  }
  const value = tab.decomposition[item.field as keyof typeof tab.decomposition];

  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-foreground">{item.label}</div>
        <FieldActions
          field={item.field}
          lockedFields={tab.lockedFields}
          regeneratingField={tab.regeneratingField}
          storyInput={tab.storyInput}
          onToggleLock={tab.onToggleLock}
          onRegenerateField={tab.onRegenerateField}
        />
      </div>
      {item.multiline ? (
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(event) => tab.onFieldChange(item.field, event.target.value)}
          placeholder={item.placeholder}
          className={textareaClassName("min-h-32")}
        />
      ) : (
        <Input
          value={typeof value === "string" ? value : ""}
          onChange={(event) => tab.onFieldChange(item.field, event.target.value)}
          placeholder={item.placeholder}
        />
      )}
    </div>
  );
}

export default function StoryEngineStudio({ tab }: StoryEngineStudioProps) {
  const payoffs = tab.decomposition.major_payoffs.filter((item) => item.trim());

  return (
    <section className="overflow-hidden rounded-lg border border-border/70 bg-background">
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr),22rem]">
        <div className="space-y-5 p-4 lg:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-primary/25 bg-primary/5 text-primary">
                  故事引擎
                </Badge>
                <span className="text-xs font-medium text-muted-foreground">把书级承诺拆成后续规划可以执行的骨架</span>
              </div>
              <h2 className="mt-3 text-lg font-semibold leading-7 text-foreground">控制主线如何持续推进</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                这里不急着写章节，而是先定义读者为什么追、长期对立如何升级、主角怎样变化，以及前中后期必须兑现哪些节点。
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <AiButton onClick={tab.onDecompose} disabled={tab.isDecomposing || !tab.storyInput.trim()}>
                {tab.isDecomposing ? "生成中..." : tab.hasPlan ? "重新生成故事引擎" : "生成故事引擎"}
              </AiButton>
              <AiButton
                variant="secondary"
                onClick={tab.onBuildConstraintEngine}
                disabled={tab.isBuilding || !tab.decomposition.selling_point.trim()}
              >
                {tab.isBuilding ? "构建中..." : "构建约束引擎"}
              </AiButton>
              <Button variant="outline" onClick={tab.onSaveEdits} disabled={tab.isSaving}>
                {tab.isSaving ? "保存中..." : "保存修改"}
              </Button>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/10 p-3">
            <div className="text-sm font-medium text-foreground">故事想法输入</div>
            <textarea
              value={tab.storyInput}
              onChange={(event) => tab.onStoryInputChange(event.target.value)}
              placeholder="用自然语言描述故事想法、想要的压迫感、想避免的风格和结局倾向。"
              className={textareaClassName("min-h-36")}
            />
            {tab.message ? (
              <div className="rounded-md bg-background/80 px-3 py-2 text-sm text-muted-foreground">
                {tab.message}
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
              <div className="text-xs font-medium text-muted-foreground">读者追更理由</div>
              <div className="mt-2 text-sm font-semibold leading-6 text-foreground">
                {previewText(tab.decomposition.selling_point, "等待生成一句话卖点")}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
              <div className="text-xs font-medium text-muted-foreground">长期压力源</div>
              <div className="mt-2 text-sm font-semibold leading-6 text-foreground">
                {previewText(tab.decomposition.core_conflict, "等待生成长期对立")}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
              <div className="text-xs font-medium text-muted-foreground">关键兑现点</div>
              <div className="mt-2 text-sm font-semibold leading-6 text-foreground">
                {payoffs.length > 0 ? `${payoffs.length} 个节点` : "等待拆出兑现节点"}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border/70 p-4 xl:border-l xl:border-t-0 lg:p-5">
          <StoryReadinessPanel tab={tab} />
        </div>
      </div>

      <div className="border-t border-border/70 bg-muted/5 p-4 lg:p-5">
        <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">主线骨架</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              这组字段会进入后续角色、卷战略、节奏拆章和章节任务，是故事能否持续推进的核心资产。
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>满意的字段先锁定</span>
            <ArrowRight className="h-3.5 w-3.5" />
            <span>再局部重生成</span>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          <SummaryFieldCard tab={tab} field="selling_point" />
          <SummaryFieldCard tab={tab} field="core_conflict" />
          <SummaryFieldCard tab={tab} field="main_hook" />
          <SummaryFieldCard tab={tab} field="ending_flavor" />
          <SummaryFieldCard tab={tab} field="progression_loop" />
          <SummaryFieldCard tab={tab} field="growth_path" />
          <div className="space-y-2 rounded-lg border border-border/60 bg-background p-3 xl:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium text-foreground">关键兑现点</div>
              <FieldActions
                field="major_payoffs"
                lockedFields={tab.lockedFields}
                regeneratingField={tab.regeneratingField}
                storyInput={tab.storyInput}
                onToggleLock={tab.onToggleLock}
                onRegenerateField={tab.onRegenerateField}
              />
            </div>
            <textarea
              value={listToText(tab.decomposition.major_payoffs)}
              onChange={(event) => tab.onFieldChange(
                "major_payoffs",
                event.target.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
              )}
              placeholder="每行一个关键兑现点。"
              className={textareaClassName("min-h-32")}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
