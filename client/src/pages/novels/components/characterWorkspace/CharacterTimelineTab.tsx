import type { CharacterTimeline } from "@ai-novel/shared/types/novel";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";

interface CharacterTimelineTabProps {
  timelineEvents: CharacterTimeline[];
  onSyncTimeline: () => void;
  isSyncingTimeline: boolean;
  onSyncAllTimeline: () => void;
  isSyncingAllTimeline: boolean;
}

export default function CharacterTimelineTab(props: CharacterTimelineTabProps) {
  const { timelineEvents, onSyncTimeline, isSyncingTimeline, onSyncAllTimeline, isSyncingAllTimeline } = props;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border/70 bg-muted/10 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium">character event flow</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              Use the events of recent chapters to observe the changes in the character's situation, and synchronize the timeline if necessary before continuing to write.
                                      </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <AiButton size="sm" variant="outline" onClick={onSyncTimeline} disabled={isSyncingTimeline}>
              {isSyncingTimeline ? "Syncing..." : "Syncing character timeline"}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onSyncAllTimeline} disabled={isSyncingAllTimeline}>
              {isSyncingAllTimeline ? "Syncing..." : "Syncing all character timelines"}
            </AiButton>
          </div>
        </div>
      </section>

      {timelineEvents.length > 0 ? (
        <div className="space-y-2">
          {timelineEvents.slice(-12).reverse().map((event) => (
            <div key={event.id} className="rounded-xl border border-border/70 bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{event.title}</div>
                <Badge variant="outline">{event.source}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {event.chapterOrder ? `章节 ${event.chapterOrder}` : "No chapter attribution"} ·{" "}
                {new Date(event.createdAt).toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{event.content}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          There are no events yet. Click "Synchronize Character Timeline" first.
                              </div>
      )}
    </div>
  );
}
