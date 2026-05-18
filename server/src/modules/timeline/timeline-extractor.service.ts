import type {
  ExtractedTimelineEvent,
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
}

export const timelineExtractorService = new TimelineExtractorService();
