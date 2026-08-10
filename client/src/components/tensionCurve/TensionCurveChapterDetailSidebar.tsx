import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { ArrowRight, BookOpenText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface TensionCurveChapterContext {
  id: string;
  chapterId?: string | null;
  chapterOrder: number;
  beatKey?: string | null;
  title: string;
  summary?: string | null;
  purpose?: string | null;
  exclusiveEvent?: string | null;
  conflictLevel?: number | null;
  conflictLevelSource?: "ai" | "user" | null;
}

interface TensionCurveChapterDetailSidebarProps {
  chapter: TensionCurveChapterContext | null;
  beatLabel?: string | null;
  onOpenChapterDetail?: () => void;
}

function FieldBlock({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm leading-6 text-foreground">{i18next.t("dict.gen_e123035e")}</div>
    </div>
  );
}

export function TensionCurveChapterDetailSidebar(props: TensionCurveChapterDetailSidebarProps) {
  const { chapter, beatLabel, onOpenChapterDetail } = props;

  if (!chapter) {
    return (
      <aside className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{i18next.t("tensionCurve.tensionCurveChapterDetailSidebar.ygzy6c")}</aside>
    );
  }

  return (
    <aside className="space-y-3 rounded-xl border border-border/70 bg-muted/10 p-3">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{i18next.t("dict.gen_db44b183")}</Badge>
          {beatLabel ? <Badge variant="outline">{beatLabel}</Badge> : null}
          {chapter.conflictLevelSource === "user" ? <Badge variant="secondary">{i18next.t("dict.gen_7d1de53a")}</Badge> : <Badge variant="outline">{i18next.t("dict.gen_f3c74370")}</Badge>}
        </div>
        <div className="text-base font-semibold leading-6 text-foreground">{chapter.title || `第${chapter.chapterOrder}章`}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <BookOpenText className="h-3.5 w-3.5" aria-hidden="true" />
          冲突强度 {typeof chapter.conflictLevel === "number" ? chapter.conflictLevel : i18next.t("dict.gen_75c038ec")}
        </div>
      </div>

      <FieldBlock label={i18next.t("dict.gen_913f4561")} value={chapter.summary} />
      <FieldBlock label={i18next.t("dict.gen_5e2adc42")} value={chapter.purpose} />
      <FieldBlock label={i18next.t("dict.gen_23e47820")} value={chapter.exclusiveEvent} />

      {onOpenChapterDetail ? (
        <Button type="button" className="w-full justify-between" variant="outline" onClick={onOpenChapterDetail}>{i18next.t("tensionCurve.tensionCurveChapterDetailSidebar.wt69i1")}<ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      ) : null}
    </aside>
  );
}
