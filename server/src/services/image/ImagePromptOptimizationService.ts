import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { runStructuredPrompt, runTextPrompt } from "../../prompting/core/promptRunner";
import {
  imageCharacterPromptOptimizePrompt,
  imageGenerationPromptAssistPrompt,
  type ImageGenerationPromptAssistInput,
  type ImageGenerationPromptAssistOutput,
} from "../../prompting/prompts/image/image.prompts";
import type {
  ImagePromptOutputLanguage,
  OptimizeCharacterImagePromptRequest,
  OptimizeNovelCoverImagePromptRequest,
} from "./types";
import { optimizeNovelCoverPrompt } from "./novelCover/novelCoverPromptSupport";

export interface OptimizedCharacterImagePrompt {
  prompt: string;
  outputLanguage: ImagePromptOutputLanguage;
}

export interface OptimizedNovelCoverImagePrompt {
  prompt: string;
  outputLanguage: ImagePromptOutputLanguage;
}

export type ImageGenerationPromptAssistRequest = ImageGenerationPromptAssistInput;
export type ImageGenerationPromptAssistResult = ImageGenerationPromptAssistOutput;

export class ImagePromptOptimizationService {
  async optimizeCharacterPrompt(
    input: OptimizeCharacterImagePromptRequest,
  ): Promise<OptimizedCharacterImagePrompt> {
    const character = await prisma.baseCharacter.findUnique({
      where: { id: input.baseCharacterId },
    });
    if (!character) {
      throw new AppError("Base character not found.", 404);
    }

    const result = await runTextPrompt({
      asset: imageCharacterPromptOptimizePrompt,
      promptInput: {
        sourcePrompt: input.sourcePrompt.trim(),
        stylePreset: input.stylePreset?.trim(),
        outputLanguage: input.outputLanguage,
        characterName: character.name,
        role: character.role,
        personality: character.personality,
        appearance: character.appearance,
        background: character.background,
      },
      options: {
        temperature: 0.4,
      },
    });

    return {
      prompt: result.output.trim(),
      outputLanguage: input.outputLanguage,
    };
  }

  async optimizeNovelCoverPrompt(
    input: OptimizeNovelCoverImagePromptRequest,
  ): Promise<OptimizedNovelCoverImagePrompt> {
    return optimizeNovelCoverPrompt(input);
  }

  async assistGenerationPrompt(
    input: ImageGenerationPromptAssistRequest,
  ): Promise<ImageGenerationPromptAssistResult> {
    const result = await runStructuredPrompt({
      asset: imageGenerationPromptAssistPrompt,
      promptInput: {
        ...input,
        title: input.title?.trim(),
        kind: input.kind?.trim(),
        prompt: input.prompt.trim(),
        negativePrompt: input.negativePrompt?.trim(),
        optimizationInstruction: input.optimizationInstruction?.trim(),
        provider: input.provider?.trim(),
        size: input.size?.trim(),
        referenceImages: input.referenceImages.map((item) => ({
          kind: item.kind.trim(),
          label: item.label.trim(),
        })),
      },
      options: {
        temperature: input.action === "optimize" ? 0.35 : 0.2,
      },
    });

    return result.output;
  }
}

export const imagePromptOptimizationService = new ImagePromptOptimizationService();
