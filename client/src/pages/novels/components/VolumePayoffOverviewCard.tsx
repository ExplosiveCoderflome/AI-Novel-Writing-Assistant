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
      chapterTitle: chapter.title?.trim() || "Unnamed chapter",
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
            <CardTitle className="text-base">Current volume foreshadowing/recycling reference</CardTitle>
            <div className="text-sm text-muted-foreground">
              Here we only look at the currently selected volume to check whether the matters to be redeemed in this volume are consistent with the chapter redemption arrangements. The full-book-level canonical ledger has been moved to an independent module above.
                                      </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Section {selectedVolume.sortOrder} roll</Badge>
            <Badge variant="outline">To be cashed {openPayoffRows.length}</Badge>
            <Badge variant="outline">Chapter has been suspended {linkedOpenPayoffCount}</Badge>
            <Badge variant={unplannedOpenPayoffs.length > 0 ? "secondary" : "outline"}>
              Associations to be filled {unplannedOpenPayoffs.length}
            </Badge>
            <Badge variant="outline">Chapter arrangement {chapterPayoffGroups.length}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 xl:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.35fr)]">
          <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-foreground">Items to be redeemed in this volume</div>
              <Badge variant="outline">{openPayoffRows.length}</Badge>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Here are the items to be fulfilled stated in the volume strategy, which can be used to see which pitfalls need to be buried and which points need to be recovered in this volume.
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
                        {item.linkedChapters.length > 0 ? "Chapter touch arranged" : "No specific chapters arranged"}
                      </Badge>
                    </div>
                    {item.linkedChapters.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {item.linkedChapters.map((entry) => (
                          <span
                            key={`${item.item}-${entry.chapterOrder}-${entry.ref}`}
                            className="rounded-full border border-border/70 px-2 py-1"
                          >
                            Section{entry.chapterOrder}chapter {entry.chapterTitle}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-muted-foreground">
                        This item to be redeemed has not yet been linked to a specific chapter in this volume. It is recommended to make up the redemption link when opening the chapter.
                                                          </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-border/70 bg-background p-3 text-xs text-muted-foreground">
                  The current volume has not been filled with items to be redeemed.
                                                      </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-foreground">Arrangements for redemption of chapters in this volume</div>
              <Badge variant="outline">{chapterPayoffGroups.length}</Badge>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              What we look at here is the redemption association that the current volume has been linked to the chapter, which is used to check whether the chapter splitting has actually been executed at the chapter level.
                                      </div>
            <div className="mt-3 space-y-2 text-sm">
              {chapterPayoffGroups.length > 0 ? (
                chapterPayoffGroups.map((chapter) => (
                  <div
                    key={chapter.chapterId}
                    className="rounded-lg border border-border/70 bg-background p-3"
                  >
                    <div className="font-medium text-foreground">
                      Section{chapter.chapterOrder}chapter {chapter.chapterTitle}
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
                  The redemption relationship has not been filled in for the chapters in the current volume. It will be more difficult to check which foreshadowing should be recycled when the chapter is opened later.
                                                      </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
