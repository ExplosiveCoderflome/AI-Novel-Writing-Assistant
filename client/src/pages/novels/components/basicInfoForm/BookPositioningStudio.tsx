import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import WorkflowProgressBar from "@/components/workflow/WorkflowProgressBar";
import type { NovelBasicFormState } from "../../novelBasicInfo.shared";
import { StatusRail } from "../workspaceShell";
import { BookFramingSection } from "./BookFramingSection";
import { FieldLabel } from "./BasicInfoFormPrimitives";

interface BookPositioningStudioProps {
  basicForm: NovelBasicFormState;
  onFormChange: (patch: Partial<NovelBasicFormState>) => void;
  titleQuickFill?: ReactNode;
  framingQuickFill?: ReactNode;
  projectQuickStart?: ReactNode;
}

const POSITIONING_FIELDS = [
  { key: "title", label: "标题" },
  { key: "description", label: "概述" },
  { key: "targetAudience", label: "读者" },
  { key: "bookSellingPoint", label: "卖点" },
  { key: "first30ChapterPromise", label: "前 30 章" },
] satisfies Array<{ key: keyof NovelBasicFormState; label: string }>;

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function createPreview(value: string, fallback: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return fallback;
  }
  return normalized.length > 44 ? `${normalized.slice(0, 44)}...` : normalized;
}

export default function BookPositioningStudio(props: BookPositioningStudioProps) {
  const { basicForm, onFormChange, titleQuickFill, framingQuickFill, projectQuickStart } = props;
  const completedCount = POSITIONING_FIELDS.filter((field) => hasText(basicForm[field.key])).length;
  const readinessPercent = Math.round((completedCount / POSITIONING_FIELDS.length) * 100);
  const readinessItems = [
    {
      label: "目标读者",
      value: createPreview(basicForm.targetAudience, "写清楚谁会追这本书"),
      description: hasText(basicForm.targetAudience) ? "已就绪" : "待补充",
      tone: hasText(basicForm.targetAudience) ? "success" as const : "neutral" as const,
    },
    {
      label: "核心卖点",
      value: createPreview(basicForm.bookSellingPoint, "明确最抓人的爽点或悬念"),
      description: hasText(basicForm.bookSellingPoint) ? "已就绪" : "待补充",
      tone: hasText(basicForm.bookSellingPoint) ? "success" as const : "neutral" as const,
    },
    {
      label: "前 30 章牵引",
      value: createPreview(basicForm.first30ChapterPromise, "告诉 AI 前期必须兑现什么"),
      description: hasText(basicForm.first30ChapterPromise) ? "已就绪" : "待补充",
      tone: hasText(basicForm.first30ChapterPromise) ? "success" as const : "neutral" as const,
    },
  ];

  return (
    <section className="space-y-6 rounded-2xl bg-muted/15 p-4 sm:p-5 lg:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
              开书定位
            </Badge>
            <span className="text-xs font-medium text-muted-foreground">标题、卖点和前期回报</span>
          </div>
          <h2 className="mt-3 text-lg font-semibold leading-7 text-foreground">把这本书的读者承诺定清楚</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            写清谁会追、为什么追、前 30 章能看到什么；AI 会沿着这组承诺继续规划世界、角色和章节。
          </p>
        </div>
        {projectQuickStart ? <div className="shrink-0">{projectQuickStart}</div> : null}
      </div>

      <div className="grid gap-5 rounded-xl bg-background/70 px-4 py-4 xl:grid-cols-[14rem_minmax(0,1fr)] xl:items-center">
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-muted-foreground">定位完成度</div>
              <div className="mt-1 text-xs text-muted-foreground">{completedCount} / {POSITIONING_FIELDS.length} 项已就绪</div>
            </div>
            <div className="text-2xl font-semibold tracking-tight text-foreground">{readinessPercent}%</div>
          </div>
          <WorkflowProgressBar progress={readinessPercent} className="h-2" />
        </div>
        <StatusRail items={readinessItems} />
      </div>

      <div className="grid items-start gap-x-8 gap-y-6 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-5">
          <div className="flex min-h-16 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">书名与故事入口</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">先用几句话交代主角、困境和最值得继续看的转折。</p>
            </div>
            {titleQuickFill ? <div className="shrink-0">{titleQuickFill}</div> : null}
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="basic-title">小说标题</FieldLabel>
            <Input
              id="basic-title"
              value={basicForm.title}
              placeholder="例如：雾港审判局"
              onChange={(event) => onFormChange({ title: event.target.value })}
              className="h-12 rounded-xl border-0 bg-background/85 text-base font-semibold ring-1 ring-border/50 transition-colors hover:bg-background focus-visible:ring-primary/30"
            />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <FieldLabel htmlFor="basic-description">一句话概述</FieldLabel>
              <span className="text-xs text-muted-foreground">主角 · 目标 · 阻力</span>
            </div>
            <textarea
              id="basic-description"
              rows={7}
              className="min-h-[184px] w-full resize-y rounded-xl border-0 bg-background/85 px-4 py-3 text-sm leading-7 outline-none ring-1 ring-border/50 transition-colors placeholder:text-muted-foreground/70 hover:bg-background focus-visible:ring-2 focus-visible:ring-primary/30"
              value={basicForm.description}
              placeholder="用 2-4 句话说明主角、核心冲突和故事看点。"
              onChange={(event) => onFormChange({ description: event.target.value })}
            />
          </div>
        </div>

        <div className="xl:border-l xl:border-border/50 xl:pl-8">
          <BookFramingSection
            basicForm={basicForm}
            onFormChange={onFormChange}
            quickFill={framingQuickFill}
          />
        </div>
      </div>
    </section>
  );
}
