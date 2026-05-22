import type {
  ExtractedTimelineEvent,
  TimelineHookDraft,
  TimelineContextForChapter,
} from "@ai-novel/shared/types/timeline";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import {
  timelineExtractorPrompt,
  type TimelineExtractorOutput,
} from "../../prompting/prompts/novel/timelineExtractor.prompts";
import { timelinePromptAdapter } from "./timeline-prompt-adapter";

export interface TimelineExtractorServiceInput {
  novelId: string;
  chapterId: string;
  chapterIndex: number;
  novelTitle: string;
  chapterTitle: string;
  chapterGoal: string;
  chapterContent: string;
  timelineContext: TimelineContextForChapter;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export class TimelineExtractorService {
  async extractFromChapter(input: TimelineExtractorServiceInput): Promise<TimelineExtractorOutput> {
    const generated = await runStructuredPrompt({
      asset: timelineExtractorPrompt,
      promptInput: {
        novelTitle: input.novelTitle,
        chapterOrder: input.chapterIndex,
        chapterTitle: input.chapterTitle,
        chapterGoal: input.chapterGoal,
        timelineContextText: timelinePromptAdapter.toPromptBlock(input.timelineContext),
        chapterContent: input.chapterContent,
      },
      options: {
        provider: input.provider,
        model: input.model,
        temperature: Math.min(input.temperature ?? 0.2, 0.4),
        novelId: input.novelId,
        chapterId: input.chapterId,
        stage: "timeline_extraction",
      },
    });
    return generated.output;
  }

  normalizeEvents(output: TimelineExtractorOutput): ExtractedTimelineEvent[] {
    return output.events.filter((event) => event.occurred || event.confidence >= 0.65);
  }

  normalizeHooks(output: TimelineExtractorOutput): TimelineHookDraft[] {
    const hooks = [
      ...output.hooks,
      ...output.events.flatMap((event) => event.possibleHooks),
    ];
    const merged = new Map<string, TimelineHookDraft>();
    for (const hook of hooks) {
      const normalized = {
        title: hook.title.replace(/\s+/g, " ").trim(),
        description: hook.description.replace(/\s+/g, " ").trim(),
        priority: hook.priority,
        resolveMode: hook.resolveMode ?? "long_arc",
        blocking: hook.blocking ?? false,
      };
      const key = `${normalized.title}::${normalized.description}`;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, normalized);
        continue;
      }
      if (!existing.blocking && normalized.blocking) {
        existing.blocking = true;
      }
      if (normalized.resolveMode === "immediate" || (normalized.resolveMode === "short_arc" && existing.resolveMode === "long_arc")) {
        existing.resolveMode = normalized.resolveMode;
      }
      const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
      if (priorityRank[normalized.priority] < priorityRank[existing.priority]) {
        existing.priority = normalized.priority;
      }
    }
    return Array.from(merged.values());
  }
}

export const timelineExtractorService = new TimelineExtractorService();
