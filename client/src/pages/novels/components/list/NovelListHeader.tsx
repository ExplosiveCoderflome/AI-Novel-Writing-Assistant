import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
            <h1 className="text-3xl font-semibold tracking-normal">{t("gen.pages.novels.components.list.NovelListHeader.gen_fd1e8631")}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              管理正在推进的小说项目，快速判断哪些可以继续写、哪些需要先处理状态。
            </p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button asChild>
            <Link to={DIRECTOR_CREATE_LINK}>
              <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              AI 自动导演开书
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={MANUAL_CREATE_LINK}>{t("gen.pages.novels.components.list.NovelListHeader.gen_e40b8718")}</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-border/60 py-3 text-sm">
        <HeaderMetric label={t("gen.pages.novels.components.list.NovelListHeader.gen_48ac4797")} value={`第 ${props.page} / ${props.totalPages} 页`} />
        <HeaderMetric label={t("gen.pages.novels.components.list.NovelListHeader.gen_9ed7d3ad")} value={`${props.totalNovels} 本`} />
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
            待恢复 {props.recoveryCandidateCount}
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
