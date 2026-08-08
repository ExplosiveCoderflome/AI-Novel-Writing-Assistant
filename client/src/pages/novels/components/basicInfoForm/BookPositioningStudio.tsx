import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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

export default function BookPositioningStudio(props: BookPositioningStudioProps) {
  const { basicForm, onFormChange, titleQuickFill, framingQuickFill, projectQuickStart, coverSection } = props;
  const completedCount = POSITIONING_FIELDS.filter((field) => hasText(basicForm[field.key])).length;
  const readinessPercent = Math.round((completedCount / POSITIONING_FIELDS.length) * 100);

  return (
    <section className="mx-auto w-full max-w-5xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">开篇定位</Badge>
            <span className="text-xs text-muted-foreground">写下读者会为这本书停留的理由</span>
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground">让读者愿意翻开第一章</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">先说清故事的开场、吸引谁，以及前期最想兑现的期待；剩下的世界、角色和章节，由 AI 接着陪你铺开。</p>
        </div>
        {projectQuickStart ? <div className="shrink-0">{projectQuickStart}</div> : null}
      </div>

      <div className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground"><span className="font-medium text-foreground">开篇信息</span> · {completedCount} / {POSITIONING_FIELDS.length} 项已准备</div>
          <div className="flex w-full items-center gap-3 sm:w-52">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${readinessPercent}%` }} /></div>
            <span className="text-sm font-semibold text-foreground">{readinessPercent}%</span>
          </div>
        </div>

        <div className="mt-5 space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3"><FieldLabel htmlFor="basic-title">小说标题</FieldLabel>{titleQuickFill ? <div className="shrink-0">{titleQuickFill}</div> : null}</div>
            <Input id="basic-title" value={basicForm.title} placeholder="例如：雾港审判局" onChange={(event) => onFormChange({ title: event.target.value })} className="h-12 border-border/70 text-base font-semibold shadow-none" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3"><FieldLabel htmlFor="basic-description">故事开场</FieldLabel><span className="text-xs text-muted-foreground">主角 · 困境 · 转折</span></div>
            <textarea id="basic-description" rows={6} className="min-h-[164px] w-full resize-y rounded-xl border border-border/70 bg-muted/[0.12] px-4 py-3 text-sm leading-7 outline-none transition placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" value={basicForm.description} placeholder="用 2-4 句话说明主角、核心冲突和故事看点。" onChange={(event) => onFormChange({ description: event.target.value })} />
          </div>

          <BookFramingSection basicForm={basicForm} onFormChange={onFormChange} quickFill={framingQuickFill} />
        </div>
      </div>

      {coverSection ? (
        <details className="group rounded-xl border border-border/60 bg-background/70 px-4 py-3">
          <summary className="cursor-pointer list-none text-sm font-medium text-foreground">封面视觉 <span className="ml-2 text-xs font-normal text-muted-foreground">可在准备好故事后再处理</span></summary>
          <div className="mt-4 [&>section]:border-t-0 [&>section]:pt-0">{coverSection}</div>
        </details>
      ) : null}
    </section>
  );
}
