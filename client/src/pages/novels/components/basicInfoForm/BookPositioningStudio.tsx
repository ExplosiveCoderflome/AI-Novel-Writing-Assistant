import type { ReactNode } from "react";
import { BookOpenCheck, CheckCircle2, Compass, FileText, Image, Map, Sparkles, Target, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { NovelBasicFormState } from "../../novelBasicInfo.shared";
import { BookFramingSection } from "./BookFramingSection";
import { FieldLabel } from "./BasicInfoFormPrimitives";

interface BookPositioningStudioProps {
  basicForm: NovelBasicFormState;
  onFormChange: (patch: Partial<NovelBasicFormState>) => void;
  titleQuickFill?: ReactNode;
  framingQuickFill?: ReactNode;
  projectQuickStart?: ReactNode;
  coverSection?: ReactNode;
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

function splitCommercialTags(value: string): string[] {
  return value
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function createPreview(value: string, fallback: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return fallback;
  }
  return normalized.length > 86 ? `${normalized.slice(0, 86)}...` : normalized;
}

function ReadinessRow(props: {
  icon: ReactNode;
  label: string;
  value: string;
  ready: boolean;
}) {
  return (
    <div className="grid grid-cols-[1.5rem,1fr,auto] items-center gap-3 border-t border-border/55 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className={cn(
        "flex h-6 w-6 items-center justify-center rounded-md",
        props.ready ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground",
      )}>
        {props.icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium text-muted-foreground">{props.label}</div>
        <div className={cn("mt-0.5 truncate text-sm", props.ready ? "text-foreground" : "text-muted-foreground")}>
          {props.value}
        </div>
      </div>
      {props.ready ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      ) : (
        <span className="text-xs text-muted-foreground">待补</span>
      )}
    </div>
  );
}

export default function BookPositioningStudio(props: BookPositioningStudioProps) {
  const { basicForm, onFormChange, titleQuickFill, framingQuickFill, projectQuickStart, coverSection } = props;
  const completedCount = POSITIONING_FIELDS.filter((field) => hasText(basicForm[field.key])).length;
  const readinessPercent = Math.round((completedCount / POSITIONING_FIELDS.length) * 100);
  const commercialTags = splitCommercialTags(basicForm.commercialTagsText);

  return (
    <section className="overflow-hidden rounded-lg border border-border/70 bg-background">
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr),22rem]">
        <div className="space-y-5 p-4 lg:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-primary/25 bg-primary/5 text-primary">
                  书级资产
                </Badge>
                <span className="text-xs font-medium text-muted-foreground">后续规划、角色和章节生成会优先读取这里</span>
              </div>
              <h2 className="mt-3 text-lg font-semibold leading-7 text-foreground">定位这本书的读者承诺</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                先把标题、主冲突、读者期待和前 30 章必须兑现的内容收束清楚，再让 AI 继续展开世界、角色和章节。
              </p>
            </div>
            {projectQuickStart ? <div className="shrink-0">{projectQuickStart}</div> : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr),minmax(20rem,1.15fr)]">
            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-3">
              <div className="space-y-2">
                <FieldLabel htmlFor="basic-title">小说标题</FieldLabel>
                <Input
                  id="basic-title"
                  value={basicForm.title}
                  placeholder="例如：雾港审判局"
                  onChange={(event) => onFormChange({ title: event.target.value })}
                  className="h-11 bg-background text-base font-semibold"
                />
                {titleQuickFill ? <div className="pt-1">{titleQuickFill}</div> : null}
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="basic-description">一句话概述</FieldLabel>
                <textarea
                  id="basic-description"
                  rows={6}
                  className="min-h-[168px] w-full resize-y rounded-md border bg-background px-3 py-2 text-sm leading-6 outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={basicForm.description}
                  placeholder="用 2-4 句话说明主角、核心冲突和故事看点。"
                  onChange={(event) => onFormChange({ description: event.target.value })}
                />
              </div>
            </div>

            <BookFramingSection
              basicForm={basicForm}
              onFormChange={onFormChange}
              quickFill={framingQuickFill}
            />
          </div>
        </div>

        <aside className="border-t border-border/70 bg-muted/10 p-4 xl:border-l xl:border-t-0 lg:p-5">
          <div className="space-y-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">定位完成度</div>
                  <div className="mt-1 text-xs text-muted-foreground">{completedCount} / {POSITIONING_FIELDS.length} 项已就绪</div>
                </div>
                <div className="text-2xl font-semibold text-foreground">{readinessPercent}%</div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${readinessPercent}%` }} />
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-background/85 p-3">
              <ReadinessRow
                icon={<Users className="h-3.5 w-3.5" />}
                label="目标读者"
                value={createPreview(basicForm.targetAudience, "写清楚谁会追这本书")}
                ready={hasText(basicForm.targetAudience)}
              />
              <ReadinessRow
                icon={<Target className="h-3.5 w-3.5" />}
                label="核心卖点"
                value={createPreview(basicForm.bookSellingPoint, "明确最抓人的爽点或悬念")}
                ready={hasText(basicForm.bookSellingPoint)}
              />
              <ReadinessRow
                icon={<Compass className="h-3.5 w-3.5" />}
                label="前 30 章牵引"
                value={createPreview(basicForm.first30ChapterPromise, "告诉 AI 前期必须兑现什么")}
                ready={hasText(basicForm.first30ChapterPromise)}
              />
            </div>

            <div className="space-y-3 rounded-lg border border-border/60 bg-background/85 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                商业标签
              </div>
              {commercialTags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {commercialTags.map((tag) => (
                    <span key={tag} className="rounded-md border border-primary/15 bg-primary/5 px-2 py-1 text-xs font-medium text-primary">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">
                  填入 3-6 个标签，帮助后续标题、简介、章节钩子保持统一。
                </p>
              )}
            </div>

            <div className="grid gap-2 text-xs text-muted-foreground">
              <div className="flex items-start gap-2 rounded-md bg-background/70 p-2">
                <BookOpenCheck className="mt-0.5 h-3.5 w-3.5 text-emerald-600" />
                <span>故事规划会读取读者承诺与商业标签。</span>
              </div>
              <div className="flex items-start gap-2 rounded-md bg-background/70 p-2">
                <Map className="mt-0.5 h-3.5 w-3.5 text-sky-600" />
                <span>世界资产可在下方继续具现为规则、地点和势力。</span>
              </div>
              <div className="flex items-start gap-2 rounded-md bg-background/70 p-2">
                <FileText className="mt-0.5 h-3.5 w-3.5 text-amber-600" />
                <span>章节执行会用前 30 章牵引约束早期正文。</span>
              </div>
            </div>

            {coverSection ? (
              <div className="rounded-lg border border-border/60 bg-background/85 px-3 pb-3 [&>section]:border-t-0 [&>section]:pt-3">
                <div className="flex items-center gap-2 pt-3 text-sm font-semibold text-foreground">
                  <Image className="h-4 w-4 text-primary" />
                  封面视觉
                </div>
                {coverSection}
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}
