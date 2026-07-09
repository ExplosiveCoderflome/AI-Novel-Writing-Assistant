import { AlertTriangle, CheckCircle2, FileText, Lock, Sparkles } from "lucide-react";
import AiButton from "@/components/common/AiButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  { key: "storyInput", label: "故事想法" },
  { key: "sellingPoint", label: "卖点" },
  { key: "conflict", label: "长期对立" },
  { key: "hook", label: "主线钩子" },
  { key: "loop", label: "推进回路" },
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

function resolveReadiness(tab: StoryMacroTabProps) {
  const readiness = {
    storyInput: hasText(tab.storyInput),
    sellingPoint: hasText(tab.decomposition.selling_point),
    conflict: hasText(tab.decomposition.core_conflict),
    hook: hasText(tab.decomposition.main_hook),
    loop: hasText(tab.decomposition.progression_loop),
  };
  const readyCount = readinessItems.filter((item) => readiness[item.key]).length;
  const missing = readinessItems.filter((item) => !readiness[item.key]).map((item) => item.label);
  return {
    readiness,
    readyCount,
    missing,
    percent: Math.round((readyCount / readinessItems.length) * 100),
  };
}

function resolveGuidance(tab: StoryMacroTabProps): string {
  if (!tab.storyInput.trim()) {
    return "先写下故事想法";
  }
  if (!tab.hasPlan) {
    return "可以生成故事引擎";
  }
  if (!tab.constraintEngine) {
    return "可以构建约束引擎";
  }
  return "保存后继续推进下游规划";
}

function hasGeneratedSkeleton(tab: StoryMacroTabProps): boolean {
  return tab.hasPlan || [
    tab.decomposition.selling_point,
    tab.decomposition.core_conflict,
    tab.decomposition.main_hook,
    tab.decomposition.progression_loop,
    tab.decomposition.growth_path,
    tab.decomposition.ending_flavor,
    ...tab.decomposition.major_payoffs,
  ].some((item) => item.trim());
}

function SummaryFieldRow({ tab, field }: { tab: StoryMacroTabProps; field: StoryMacroField }) {
  const item = SUMMARY_FIELDS.find((candidate) => candidate.field === field);
  if (!item) {
    return null;
  }
  const value = tab.decomposition[item.field as keyof typeof tab.decomposition];

  return (
    <div className="grid gap-3 border-t border-border/60 py-4 first:border-t-0 first:pt-0 lg:grid-cols-[10rem,minmax(0,1fr)]">
      <div className="flex flex-col gap-2">
        <div className="text-sm font-semibold text-foreground">{item.label}</div>
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
          className={textareaClassName("min-h-28")}
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
  const readiness = resolveReadiness(tab);
  const lockedCount = Object.values(tab.lockedFields).filter(Boolean).length;
  const payoffs = tab.decomposition.major_payoffs.filter((item) => item.trim());
  const showSkeleton = hasGeneratedSkeleton(tab);
  const statusText = tab.issues.length > 0
    ? `${tab.issues.length} 条冲突或缺口`
    : readiness.missing.length > 0
      ? `待补：${readiness.missing.slice(0, 2).join("、")}`
      : "核心骨架已就绪";

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col items-center px-1 py-8 sm:py-12">
      <div className="w-full max-w-4xl text-center">
        <h2 className="text-2xl font-semibold tracking-normal text-foreground sm:text-[32px]">
          把故事想法变成可持续推进的主线
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
          AI 会整理卖点、长期对立、主线钩子、推进回路和关键兑现点，让后续角色、卷规划和章节任务有稳定方向。
        </p>
      </div>

      <div className="mt-8 w-full max-w-4xl rounded-lg bg-muted/20 p-3 shadow-[0_14px_44px_rgba(15,23,42,0.06)] transition focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/30 sm:p-4">
        <textarea
          value={tab.storyInput}
          onChange={(event) => tab.onStoryInputChange(event.target.value)}
          placeholder="例如：一个普通人被卷入无法退出的组织，一边维持日常生活，一边发现家人失踪背后藏着更大的真相。"
          className="min-h-[180px] w-full resize-y bg-transparent px-1 py-1 text-base leading-7 text-foreground outline-none placeholder:text-muted-foreground/60 sm:text-lg sm:leading-8"
        />
        <div className="flex flex-col gap-3 border-t border-border/50 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-4 w-4" />
              {resolveGuidance(tab)}
            </span>
            <span className="hidden text-muted-foreground/50 sm:inline">/</span>
            <span>{readiness.percent}% 就绪</span>
            <span className="hidden text-muted-foreground/50 sm:inline">/</span>
            <span className={cn(tab.issues.length > 0 && "text-amber-700")}>{statusText}</span>
            {lockedCount > 0 ? (
              <>
                <span className="hidden text-muted-foreground/50 sm:inline">/</span>
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" />
                  {lockedCount} 个锁定
                </span>
              </>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
      </div>

      {!showSkeleton ? (
        <div className="mt-6 flex w-full max-w-4xl items-start gap-2 rounded-lg bg-muted/15 px-4 py-3 text-sm leading-6 text-muted-foreground">
          <FileText className="mt-1 h-4 w-4 shrink-0" />
          <span>生成故事引擎后，这里会展示主线骨架。你可以先只写自然语言想法，不需要手动填写大纲字段。</span>
        </div>
      ) : (
        <div className="mt-7 w-full max-w-5xl space-y-6">
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="min-w-0 border-t border-border/60 pt-3">
              <div className="text-xs font-medium text-muted-foreground">读者追更理由</div>
              <div className="mt-2 text-sm font-semibold leading-6 text-foreground">
                {previewText(tab.decomposition.selling_point, "等待生成一句话卖点")}
              </div>
            </div>
            <div className="min-w-0 border-t border-border/60 pt-3">
              <div className="text-xs font-medium text-muted-foreground">长期压力源</div>
              <div className="mt-2 text-sm font-semibold leading-6 text-foreground">
                {previewText(tab.decomposition.core_conflict, "等待生成长期对立")}
              </div>
            </div>
            <div className="min-w-0 border-t border-border/60 pt-3">
              <div className="text-xs font-medium text-muted-foreground">关键兑现点</div>
              <div className="mt-2 text-sm font-semibold leading-6 text-foreground">
                {payoffs.length > 0 ? `${payoffs.length} 个节点` : "等待拆出兑现节点"}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">主线骨架</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                满意的字段可以先锁定，再让 AI 只重生成其他部分。
              </p>
            </div>

            <div className="rounded-lg bg-background">
              <SummaryFieldRow tab={tab} field="selling_point" />
              <SummaryFieldRow tab={tab} field="core_conflict" />
              <SummaryFieldRow tab={tab} field="main_hook" />
              <SummaryFieldRow tab={tab} field="ending_flavor" />
              <SummaryFieldRow tab={tab} field="progression_loop" />
              <SummaryFieldRow tab={tab} field="growth_path" />
              <div className="grid gap-3 border-t border-border/60 py-4 lg:grid-cols-[10rem,minmax(0,1fr)]">
                <div className="flex flex-col gap-2">
                  <div className="text-sm font-semibold text-foreground">关键兑现点</div>
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

          {tab.issues.length > 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-900">
              <AlertTriangle className="mt-1 h-4 w-4 shrink-0" />
              <span>当前还有 {tab.issues.length} 条冲突或缺口，可在下方高级区查看详情。</span>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 px-4 py-3 text-sm leading-6 text-emerald-900">
              <CheckCircle2 className="mt-1 h-4 w-4 shrink-0" />
              <span>主线骨架可以继续保存，并交给后续角色、卷规划和章节任务使用。</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
