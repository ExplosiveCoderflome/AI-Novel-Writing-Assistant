import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { runTextPrompt } from "../../prompting/core/promptRunner";
import { imageCharacterPromptOptimizePrompt } from "../../prompting/prompts/image/image.prompts";
import type {
  ImagePromptOutputLanguage,
  OptimizeCharacterImagePromptRequest,
} from "./types";

export interface OptimizedCharacterImagePrompt {
  prompt: string;
  outputLanguage: ImagePromptOutputLanguage;
}

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
}

export const imagePromptOptimizationService = new ImagePromptOptimizationService();
