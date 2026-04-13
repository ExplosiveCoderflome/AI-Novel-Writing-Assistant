import { createHash } from "node:crypto";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  StoryWorldSlice,
  StoryWorldSliceBuilderMode,
  StoryWorldSliceOverrides,
  StoryWorldSliceView,
} from "@ai-novel/shared/types/storyWorldSlice";
import { prisma } from "../../../db/prisma";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { storyWorldSlicePrompt } from "../../../prompting/prompts/storyWorldSlice/storyWorldSlice.prompts";
import {
  buildWorldBindingSupport,
  buildWorldStructureFromLegacySource,
  parseWorldStructurePayload,
} from "../../world/worldStructure";
import {
  buildStoryWorldSliceView,
  normalizeStoryWorldSlice,
  parseStoryWorldSlice,
  parseStoryWorldSliceOverrides,
  STORY_WORLD_SLICE_SCHEMA_VERSION,
} from "./storyWorldSlicePersistence";

interface EnsureStoryWorldSliceOptions {
  storyInput?: string;
  builderMode?: StoryWorldSliceBuilderMode;
}

interface RefreshStoryWorldSliceOptions extends EnsureStoryWorldSliceOptions {
  overrides?: StoryWorldSliceOverrides;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

function buildStoryInputDigest(storyInput: string): string {
  return createHash("sha256").update(storyInput.trim()).digest("hex");
}

function normalizeOverrides(input: StoryWorldSliceOverrides): StoryWorldSliceOverrides {
  return {
    primaryLocationId: input.primaryLocationId?.trim() || null,
    requiredForceIds: Array.from(new Set((input.requiredForceIds ?? []).map((item) => item.trim()).filter(Boolean))),
    requiredLocationIds: Array.from(new Set((input.requiredLocationIds ?? []).map((item) => item.trim()).filter(Boolean))),
    requiredRuleIds: Array.from(new Set((input.requiredRuleIds ?? []).map((item) => item.trim()).filter(Boolean))),
    scopeNote: input.scopeNote?.trim() || null,
  };
}

export class NovelWorldSliceService {
  private async getNovelContext(novelId: string) {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: {
        storyMacroPlan: {
          select: {
            storyInput: true,
          },
        },
        world: true,
      },
    });
    if (!novel) {
      throw new Error("小说不存在。");
    }
    return novel;
  }

  private resolveStoryInput(
    novel: Awaited<ReturnType<NovelWorldSliceService["getNovelContext"]>>,
    explicitStoryInput?: string,
  ): { storyInput: string; source: string | null } {
    if (explicitStoryInput?.trim()) {
      return { storyInput: explicitStoryInput.trim(), source: "explicit" };
    }
    if (novel.storyMacroPlan?.storyInput?.trim()) {
      return { storyInput: novel.storyMacroPlan.storyInput.trim(), source: "story_macro" };
    }
    if (novel.description?.trim()) {
      return { storyInput: novel.description.trim(), source: "novel_description" };
    }
    return { storyInput: "", source: null };
  }

  private isSliceStale(input: {
    slice: StoryWorldSlice | null;
    worldId: string | null;
    worldUpdatedAt: string | null;
    storyInputDigest: string;
  }): boolean {
    if (!input.worldId) {
      return false;
    }
    if (!input.slice) {
      return true;
    }
    return input.slice.worldId !== input.worldId
      || input.slice.metadata.schemaVersion !== STORY_WORLD_SLICE_SCHEMA_VERSION
      || input.slice.metadata.sourceWorldUpdatedAt !== input.worldUpdatedAt
      || input.slice.metadata.storyInputDigest !== input.storyInputDigest;
  }

  private async invokeSliceModel(input: {
    novel: Awaited<ReturnType<NovelWorldSliceService["getNovelContext"]>>;
    storyInput: string;
    overrides: StoryWorldSliceOverrides;
    builderMode: StoryWorldSliceBuilderMode;
  } & Pick<RefreshStoryWorldSliceOptions, "provider" | "model" | "temperature">): Promise<StoryWorldSlice> {
    const world = input.novel.world;
    if (!world) {
      throw new Error("当前小说未绑定世界设定。");
    }

    const parsedPayload = parseWorldStructurePayload(world.structureJson, world.bindingSupportJson);
    const structure = parsedPayload.hasStructuredData
      ? parsedPayload.structure
      : buildWorldStructureFromLegacySource(world);
    const bindingSupport = world.bindingSupportJson?.trim()
      ? parsedPayload.bindingSupport
      : buildWorldBindingSupport(structure);
    const storyInputDigest = buildStoryInputDigest(input.storyInput);
    const result = await runStructuredPrompt({
      asset: storyWorldSlicePrompt,
      promptInput: {
        novel: input.novel,
        structure,
        bindingSupport,
        storyInput: input.storyInput,
        overrides: input.overrides,
        builderMode: input.builderMode,
      },
      options: {
        provider: input.provider,
        model: input.model,
        temperature: input.temperature ?? 0.25,
      },
    });
    const parsed = result.output;

    return normalizeStoryWorldSlice({
      raw: parsed,
      storyId: input.novel.id,
      worldId: world.id,
      sourceWorldUpdatedAt: world.updatedAt.toISOString(),
      storyInputDigest,
      builtFromStructuredData: parsedPayload.hasStructuredData,
      builderMode: input.builderMode,
      structure,
      bindingSupport,
      overrides: input.overrides,
    });
  }

  private async persistSlice(
    novelId: string,
    slice: StoryWorldSlice | null,
    overrides: StoryWorldSliceOverrides,
  ): Promise<void> {
    await prisma.novel.update({
      where: { id: novelId },
      data: {
        storyWorldSliceJson: slice ? JSON.stringify(slice) : null,
        storyWorldSliceOverridesJson: JSON.stringify(overrides),
        storyWorldSliceSchemaVersion: STORY_WORLD_SLICE_SCHEMA_VERSION,
      },
    });
  }

  async getWorldSliceView(novelId: string): Promise<StoryWorldSliceView> {
    const novel = await this.getNovelContext(novelId);
    const overrides = normalizeOverrides(parseStoryWorldSliceOverrides(novel.storyWorldSliceOverridesJson));
    const { storyInput, source } = this.resolveStoryInput(novel);
    const digest = buildStoryInputDigest(storyInput);
    const slice = parseStoryWorldSlice(novel.storyWorldSliceJson);
    const parsedPayload = novel.world
      ? parseWorldStructurePayload(novel.world.structureJson, novel.world.bindingSupportJson)
      : null;
    const structure = novel.world
      ? (parsedPayload?.hasStructuredData
        ? parsedPayload.structure
        : buildWorldStructureFromLegacySource(novel.world))
      : null;
    const isStale = this.isSliceStale({
      slice,
      worldId: novel.worldId ?? null,
      worldUpdatedAt: novel.world?.updatedAt.toISOString() ?? null,
      storyInputDigest: digest,
    });

    return buildStoryWorldSliceView({
      worldId: novel.worldId ?? null,
      worldName: novel.world?.name ?? null,
      slice,
      overrides,
      structure,
      isStale,
      storyInputSource: source,
    });
  }

  async ensureStoryWorldSlice(
    novelId: string,
    options: EnsureStoryWorldSliceOptions = {},
  ): Promise<StoryWorldSlice | null> {
    const novel = await this.getNovelContext(novelId);
    if (!novel.world) {
      return null;
    }
    const overrides = normalizeOverrides(parseStoryWorldSliceOverrides(novel.storyWorldSliceOverridesJson));
    const { storyInput } = this.resolveStoryInput(novel, options.storyInput);
    const digest = buildStoryInputDigest(storyInput);
    const currentSlice = parseStoryWorldSlice(novel.storyWorldSliceJson);
    const stale = this.isSliceStale({
      slice: currentSlice,
      worldId: novel.world.id,
      worldUpdatedAt: novel.world.updatedAt.toISOString(),
      storyInputDigest: digest,
    });
    if (!stale) {
      return currentSlice;
    }
    const nextSlice = await this.invokeSliceModel({
      novel,
      storyInput,
      overrides,
      builderMode: options.builderMode ?? "runtime",
    });
    await this.persistSlice(novelId, nextSlice, overrides);
    return nextSlice;
  }

  async refreshWorldSlice(
    novelId: string,
    options: RefreshStoryWorldSliceOptions = {},
  ): Promise<StoryWorldSliceView> {
    const novel = await this.getNovelContext(novelId);
    const storedOverrides = parseStoryWorldSliceOverrides(novel.storyWorldSliceOverridesJson);
    const overrides = normalizeOverrides(options.overrides ?? storedOverrides);
    if (!novel.world) {
      await this.persistSlice(novelId, null, overrides);
      return buildStoryWorldSliceView({
        worldId: null,
        worldName: null,
        slice: null,
        overrides,
        structure: null,
        isStale: false,
        storyInputSource: null,
      });
    }
    const { storyInput, source } = this.resolveStoryInput(novel, options.storyInput);
    const slice = await this.invokeSliceModel({
      novel,
      storyInput,
      overrides,
      builderMode: options.builderMode ?? "manual_refresh",
      provider: options.provider,
      model: options.model,
      temperature: options.temperature,
    });
    await this.persistSlice(novelId, slice, overrides);

    const parsedPayload = parseWorldStructurePayload(novel.world.structureJson, novel.world.bindingSupportJson);
    const structure = parsedPayload.hasStructuredData
      ? parsedPayload.structure
      : buildWorldStructureFromLegacySource(novel.world);

    return buildStoryWorldSliceView({
      worldId: novel.world.id,
      worldName: novel.world.name,
      slice,
      overrides,
      structure,
      isStale: false,
      storyInputSource: source,
    });
  }

  async updateWorldSliceOverrides(
    novelId: string,
    overridesInput: StoryWorldSliceOverrides,
  ): Promise<StoryWorldSliceView> {
    const novel = await this.getNovelContext(novelId);
    const overrides = normalizeOverrides(overridesInput);
    if (!novel.world) {
      await this.persistSlice(novelId, null, overrides);
      return buildStoryWorldSliceView({
        worldId: null,
        worldName: null,
        slice: null,
        overrides,
        structure: null,
        isStale: false,
        storyInputSource: null,
      });
    }
    return this.refreshWorldSlice(novelId, {
      overrides,
      builderMode: "manual_refresh",
    });
  }
}
