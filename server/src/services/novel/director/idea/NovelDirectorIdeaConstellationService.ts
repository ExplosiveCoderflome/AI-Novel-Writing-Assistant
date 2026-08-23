import type {
  DirectorIdeaConstellationComposeRequest,
  DirectorIdeaConstellationComposeResponse,
  DirectorIdeaConstellationOptionsRequest,
  DirectorIdeaConstellationOptionsResponse,
} from "@ai-novel/shared/types/novelDirector";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import {
  directorIdeaConstellationComposePrompt,
  directorIdeaConstellationOptionsPrompt,
} from "../../../../prompting/prompts/novel/ideaConstellation/ideaConstellation.prompts";
import {
  buildDirectorIdeaContextSummary,
  shouldRetryDirectorIdeaWithOriginalContext,
} from "./ideaContext";
import { marketRadarService } from "../../../../modules/marketRadar/application/MarketRadarService";

const CONSTELLATION_OPTIONS_MAX_TOKENS = 5_000;
const CONSTELLATION_COMPOSE_MAX_TOKENS = 800;
const CONSTELLATION_RETRY_TEMPERATURE = 0.25;

function optionsTemperature(input: DirectorIdeaConstellationOptionsRequest): number {
  return Math.min(0.8, Math.max(0.55, input.temperature ?? 0.72));
}

function composeTemperature(input: DirectorIdeaConstellationComposeRequest): number {
  return Math.min(0.72, Math.max(0.4, input.temperature ?? 0.58));
}

async function runOptionsPrompt(input: DirectorIdeaConstellationOptionsRequest, temperature: number) {
  const marketBriefPrompt = await marketRadarService.getBriefPromptBlock(input.marketBriefId);
  return runStructuredPrompt({
    asset: directorIdeaConstellationOptionsPrompt,
    promptInput: { contextSummary: buildDirectorIdeaContextSummary(input, marketBriefPrompt) },
    options: {
      provider: input.provider,
      model: input.model,
      temperature,
      maxTokens: CONSTELLATION_OPTIONS_MAX_TOKENS,
    },
  });
}

async function runComposePrompt(input: DirectorIdeaConstellationComposeRequest, temperature: number) {
  const marketBriefPrompt = await marketRadarService.getBriefPromptBlock(input.marketBriefId);
  return runStructuredPrompt({
    asset: directorIdeaConstellationComposePrompt,
    promptInput: {
      contextSummary: buildDirectorIdeaContextSummary(input, marketBriefPrompt),
      selectedSummary: input.selectedOptions
        .map((option) => `${option.category}：${option.label}（${option.hint}）`)
        .join("\n"),
    },
    options: {
      provider: input.provider,
      model: input.model,
      temperature,
      maxTokens: CONSTELLATION_COMPOSE_MAX_TOKENS,
    },
  });
}

export class NovelDirectorIdeaConstellationService {
  async generateOptions(
    input: DirectorIdeaConstellationOptionsRequest,
  ): Promise<DirectorIdeaConstellationOptionsResponse> {
    let result: Awaited<ReturnType<typeof runOptionsPrompt>>;
    try {
      result = await runOptionsPrompt(input, optionsTemperature(input));
    } catch (error) {
      if (!shouldRetryDirectorIdeaWithOriginalContext(error)) throw error;
      result = await runOptionsPrompt(input, CONSTELLATION_RETRY_TEMPERATURE);
    }

    return {
      options: result.output.options.map((option) => ({
        ...option,
        id: option.id.trim(),
        label: option.label.trim(),
        hint: option.hint.trim(),
      })),
    };
  }

  async compose(
    input: DirectorIdeaConstellationComposeRequest,
  ): Promise<DirectorIdeaConstellationComposeResponse> {
    let result: Awaited<ReturnType<typeof runComposePrompt>>;
    try {
      result = await runComposePrompt(input, composeTemperature(input));
    } catch (error) {
      if (!shouldRetryDirectorIdeaWithOriginalContext(error)) throw error;
      result = await runComposePrompt(input, CONSTELLATION_RETRY_TEMPERATURE);
    }
    return { idea: result.output.idea.trim() };
  }
}

export const novelDirectorIdeaConstellationService = new NovelDirectorIdeaConstellationService();
