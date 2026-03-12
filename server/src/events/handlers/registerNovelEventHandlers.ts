import { NovelService } from "../../services/novel/NovelService";
import type { EventBus } from "../EventBus";

export function registerNovelEventHandlers(eventBus: EventBus): void {
  eventBus.on("pipeline:completed", async (event) => {
    if (event.type !== "pipeline:completed" || event.payload.status !== "succeeded") {
      return;
    }
    const novelService = new NovelService();
    await novelService.createNovelSnapshot(
      event.payload.novelId,
      "auto_milestone",
      `pipeline-${event.payload.jobId.slice(0, 8)}`,
    );
  }, 100);
}
