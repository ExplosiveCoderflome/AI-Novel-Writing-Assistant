import { Link } from "react-router-dom";
import { RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DIRECTOR_CREATE_LINK,
  MANUAL_CREATE_LINK,
  type NovelListSummaryItem,
} from "./novelListViewModel";
import { toneTextClass } from "./novelListTone";

export function NovelListHeader(props: {
  page: number;
  totalPages: number;
  totalNovels: number;
  recoveryCandidateCount: number;
  summary: NovelListSummaryItem[];
  onOpenRecovery: () => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-normal">Novel list</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Manage ongoing novel projects and quickly determine which ones can be continued and which ones need to be processed first.
                                      </p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button asChild>
            <Link to={DIRECTOR_CREATE_LINK}>
              <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              AI automatic director opens book
                                      </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={MANUAL_CREATE_LINK}>Create a novel manually</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-border/60 py-3 text-sm">
        <HeaderMetric label="current" value={`第 ${props.page} / ${props.totalPages} 页`} />
        <HeaderMetric label="total" value={`${props.totalNovels} 本`} />
        {props.summary.map((item) => (
          <HeaderMetric
            key={item.id}
            label={item.label}
            value={String(item.value)}
            valueClassName={toneTextClass(item.tone)}
          />
        ))}
        {props.recoveryCandidateCount > 0 ? (
          <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={props.onOpenRecovery}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            To be restored {props.recoveryCandidateCount}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function HeaderMetric(props: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-muted-foreground">{props.label}</span>
      <span className={`font-medium text-foreground ${props.valueClassName ?? ""}`}>{props.value}</span>
    </span>
  );
}
