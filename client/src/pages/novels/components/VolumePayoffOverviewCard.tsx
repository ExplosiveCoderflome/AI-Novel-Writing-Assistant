import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { VolumePlan } from "@ai-novel/shared/types/novel";

interface VolumePayoffOverviewCardProps {
  selectedVolume: VolumePlan;
}

function normalizePayoffText(value: string): string {
  return value.trim().toLowerCase().replace(/[\s，。、《》“”"'‘’()（）\-—]/g, "");
}

function isLikelySamePayoff(left: string, right: string): boolean {
  const normalizedLeft = normalizePayoffText(left);
  const normalizedRight = normalizePayoffText(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  return (
    normalizedLeft === normalizedRight
    || normalizedLeft.includes(normalizedRight)
    || normalizedRight.includes(normalizedLeft)
  );
}

export default function VolumePayoffOverviewCard(props: VolumePayoffOverviewCardProps) {
  const { selectedVolume } = props;
  const chapterPayoffGroups = selectedVolume.chapters
    .map((chapter) => ({
      chapterId: chapter.id,
      chapterOrder: chapter.chapterOrder,
      chapterTitle: chapter.title?.trim() || "未命名章节",
      refs: chapter.payoffRefs.map((item) => item.trim()).filter(Boolean),
    }))
    .filter((chapter) => chapter.refs.length > 0);

  const chapterPayoffEntries = chapterPayoffGroups.flatMap((chapter) =>
    chapter.refs.map((ref) => ({
      ref,
      chapterOrder: chapter.chapterOrder,
      chapterTitle: chapter.chapterTitle,
    })),
  );

  const openPayoffRows = selectedVolume.openPayoffs
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => ({
      item,
      linkedChapters: chapterPayoffEntries.filter((entry) => isLikelySamePayoff(item, entry.ref)),
    }));

  const linkedOpenPayoffCount = openPayoffRows.filter((item) => item.linkedChapters.length > 0).length;
  const unplannedOpenPayoffs = openPayoffRows.filter((item) => item.linkedChapters.length === 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="text-base">当前卷伏笔 / 回收参考</CardTitle>
            <div className="text-sm text-muted-foreground">
              这里只看当前选中卷，用来核对本卷待兑现事项和章节兑现安排是否一致。全书级 canonical 账本已经挪到上方的独立模块。
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">第 {selectedVolume.sortOrder} 卷</Badge>
            <Badge variant="outline">待兑现 {openPayoffRows.length}</Badge>
            <Badge variant="outline">已挂章节 {linkedOpenPayoffCount}</Badge>
            <Badge variant={unplannedOpenPayoffs.length > 0 ? "secondary" : "outline"}>
              待补关联 {unplannedOpenPayoffs.length}
            </Badge>
            <Badge variant="outline">章节安排 {chapterPayoffGroups.length}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 xl:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.35fr)]">
          <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-foreground">本卷待兑现事项</div>
              <Badge variant="outline">{openPayoffRows.length}</Badge>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              这里是卷战略里声明的待兑现事项，用来看这一卷到底有哪些坑要埋、哪些点要回收。
            </div>
            <div className="mt-3 space-y-2 text-sm">
              {openPayoffRows.length > 0 ? (
                openPayoffRows.map((item) => (
                  <div
                    key={item.item}
                    className="rounded-lg border border-border/70 bg-background p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-foreground">{item.item}</div>
                      <Badge variant={item.linkedChapters.length > 0 ? "default" : "secondary"}>
                        {item.linkedChapters.length > 0 ? "已安排章节触碰" : "未安排具体章节"}
                      </Badge>
                    </div>
                    {item.linkedChapters.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {item.linkedChapters.map((entry) => (
                          <span
                            key={`${item.item}-${entry.chapterOrder}-${entry.ref}`}
                            className="rounded-full border border-border/70 px-2 py-1"
                          >
                            第{entry.chapterOrder}章 {entry.chapterTitle}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-muted-foreground">
                        这条待兑现事项还没有挂到本卷具体章节，建议在拆章时补上兑现关联。
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-border/70 bg-background p-3 text-xs text-muted-foreground">
                  当前卷还没有填写待兑现事项。
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-foreground">本卷章节兑现安排</div>
              <Badge variant="outline">{chapterPayoffGroups.length}</Badge>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              这里看的是当前卷已经挂到章节里的兑现关联，用来检查拆章是否真正落到了章节级执行。
            </div>
            <div className="mt-3 space-y-2 text-sm">
              {chapterPayoffGroups.length > 0 ? (
                chapterPayoffGroups.map((chapter) => (
                  <div
                    key={chapter.chapterId}
                    className="rounded-lg border border-border/70 bg-background p-3"
                  >
                    <div className="font-medium text-foreground">
                      第{chapter.chapterOrder}章 {chapter.chapterTitle}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {chapter.refs.map((ref) => (
                        <span
                          key={`${chapter.chapterId}-${ref}`}
                          className="rounded-full border border-border/70 px-2 py-1"
                        >
                          {ref}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-border/70 bg-background p-3 text-xs text-muted-foreground">
                  当前卷章节还没有填写兑现关联，后续拆章时会更难核对哪些铺垫该回收。
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
