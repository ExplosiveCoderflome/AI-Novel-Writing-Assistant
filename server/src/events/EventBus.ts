import type { NovelEvent, NovelEventType, EventHandler } from "./types";

interface HandlerEntry {
  handler: EventHandler;
  priority: number;
}

export class EventBus {
  private handlers = new Map<NovelEventType, HandlerEntry[]>();

  on<T extends NovelEvent>(eventType: T["type"], handler: EventHandler<T>, priority = 0): void {
    const list = this.handlers.get(eventType) ?? [];
    list.push({ handler: handler as EventHandler, priority });
    list.sort((a, b) => a.priority - b.priority);
    this.handlers.set(eventType, list);
  }

  off(eventType: NovelEventType, handler: EventHandler): void {
    const list = this.handlers.get(eventType) ?? [];
    const next = list.filter((e) => e.handler !== handler);
    if (next.length > 0) this.handlers.set(eventType, next);
    else this.handlers.delete(eventType);
  }

  async emit(event: NovelEvent): Promise<void> {
    const list = this.handlers.get(event.type) ?? [];
    for (const { handler } of list) {
      try {
        await handler(event);
      } catch (err) {
        console.error(`[EventBus] handler error for ${event.type}:`, err);
      }
    }
  }
}

export const novelEventBus = new EventBus();
