import { Link } from "react-router-dom";
import { RotateCcw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
    <section className="rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">小说列表</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              管理正在推进的小说项目，快速判断哪些可以继续写、哪些需要先处理状态。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">第 {props.page} / {props.totalPages} 页</Badge>
            <Badge variant="outline">共 {props.totalNovels} 本</Badge>
            {props.summary.map((item) => (
              <Badge key={item.id} variant="outline" className={toneTextClass(item.tone)}>
                {item.label} {item.value}
              </Badge>
            ))}
            {props.recoveryCandidateCount > 0 ? (
              <Button type="button" size="sm" variant="outline" onClick={props.onOpenRecovery}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                待恢复 {props.recoveryCandidateCount}
              </Button>
            ) : null}
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
            <Link to={MANUAL_CREATE_LINK}>手动创建小说</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
