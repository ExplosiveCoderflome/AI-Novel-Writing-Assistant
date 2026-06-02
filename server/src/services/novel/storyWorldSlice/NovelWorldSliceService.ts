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

interface ActiveWorldSource {
  id: string;
  name: string;
  structureJson: string | null;
  bindingSupportJson: string | null;
  updatedAt: Date;
  storySliceJson: string | null;
  storySliceOverridesJson: string | null;
}

interface NovelWorldSliceRow {
  id: string;
  title: string | null;
  coverSummary: string | null;
  structuredDataJson: string | null;
  bindingContractJson: string | null;
  storySliceJson: string | null;
  storySliceOverridesJson: string | null;
  updatedAt: Date | string;
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

  private async getNovelWorldRow(novelId: string): Promise<NovelWorldSliceRow | null> {
    const rows = await prisma.$queryRaw<NovelWorldSliceRow[]>`
      SELECT
        "id",
        "title",
        "coverSummary",
        "structuredDataJson",
        "bindingContractJson",
        "storySliceJson",
        "storySliceOverridesJson",
        "updatedAt"
      FROM "NovelWorld"
      WHERE "novelId" = ${novelId}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private async getActiveWorldSource(
    novel: Awaited<ReturnType<NovelWorldSliceService["getNovelContext"]>>,
  ): Promise<ActiveWorldSource | null> {
    const novelWorld = await this.getNovelWorldRow(novel.id);
    if (novelWorld?.structuredDataJson?.trim()) {
      return {
        id: novelWorld.id,
        name: novelWorld.title ?? novelWorld.coverSummary ?? "本书世界",
        structureJson: novelWorld.structuredDataJson,
        bindingSupportJson: novelWorld.bindingContractJson,
        storySliceJson: novelWorld.storySliceJson,
        storySliceOverridesJson: novelWorld.storySliceOverridesJson,
        updatedAt: new Date(novelWorld.updatedAt),
      };
    }
    if (!novel.world) {
      return null;
    }
    return {
      id: novel.world.id,
      name: novel.world.name,
      structureJson: novel.world.structureJson,
      bindingSupportJson: novel.world.bindingSupportJson,
      storySliceJson: novel.storyWorldSliceJson,
      storySliceOverridesJson: novel.storyWorldSliceOverridesJson,
      updatedAt: novel.world.updatedAt,
    };
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
    activeWorld: ActiveWorldSource;
    storyInput: string;
    overrides: StoryWorldSliceOverrides;
    builderMode: StoryWorldSliceBuilderMode;
  } & Pick<RefreshStoryWorldSliceOptions, "provider" | "model" | "temperature">): Promise<StoryWorldSlice> {
    const world = input.activeWorld;
    if (!world.structureJson?.trim()) {
      throw new Error("当前小说没有可用的本书世界结构。");
    }

    const parsedPayload = parseWorldStructurePayload(world.structureJson, world.bindingSupportJson);
    const structure = parsedPayload.hasStructuredData
      ? parsedPayload.structure
      : input.novel.world
        ? buildWorldStructureFromLegacySource(input.novel.world)
        : parsedPayload.structure;
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
    const novelWorldRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "NovelWorld" WHERE "novelId" = ${novelId} LIMIT 1
    `;
    if (novelWorldRows.length > 0) {
      await prisma.$executeRaw`
        UPDATE "NovelWorld"
        SET
          "storySliceJson" = ${slice ? JSON.stringify(slice) : null},
          "storySliceOverridesJson" = ${JSON.stringify(overrides)},
          "storySliceSchemaVersion" = ${STORY_WORLD_SLICE_SCHEMA_VERSION},
          "storySliceBuiltAt" = ${slice?.metadata.builtAt ?? null},
          "storySliceDigest" = ${slice?.metadata.storyInputDigest ?? null}
        WHERE "novelId" = ${novelId}
      `;
    }
  }

  async getWorldSliceView(novelId: string): Promise<StoryWorldSliceView> {
    const novel = await this.getNovelContext(novelId);
    const activeWorld = await this.getActiveWorldSource(novel);
    const overrides = normalizeOverrides(parseStoryWorldSliceOverrides(
      activeWorld?.storySliceOverridesJson ?? novel.storyWorldSliceOverridesJson,
    ));
    const { storyInput, source } = this.resolveStoryInput(novel);
    const digest = buildStoryInputDigest(storyInput);
    const slice = parseStoryWorldSlice(activeWorld?.storySliceJson ?? novel.storyWorldSliceJson);
    const parsedPayload = activeWorld
      ? parseWorldStructurePayload(activeWorld.structureJson, activeWorld.bindingSupportJson)
      : null;
    const structure = activeWorld
      ? (parsedPayload?.hasStructuredData
        ? parsedPayload.structure
        : novel.world
          ? buildWorldStructureFromLegacySource(novel.world)
          : null)
      : null;
    const isStale = this.isSliceStale({
      slice,
      worldId: activeWorld?.id ?? null,
      worldUpdatedAt: activeWorld?.updatedAt.toISOString() ?? null,
      storyInputDigest: digest,
    });

    return buildStoryWorldSliceView({
      worldId: activeWorld?.id ?? null,
      worldName: activeWorld?.name ?? null,
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
    const activeWorld = await this.getActiveWorldSource(novel);
    if (!activeWorld) {
      return null;
    }
    const overrides = normalizeOverrides(parseStoryWorldSliceOverrides(
      activeWorld.storySliceOverridesJson ?? novel.storyWorldSliceOverridesJson,
    ));
    const { storyInput } = this.resolveStoryInput(novel, options.storyInput);
    const digest = buildStoryInputDigest(storyInput);
    const currentSlice = parseStoryWorldSlice(activeWorld.storySliceJson ?? novel.storyWorldSliceJson);
    const stale = this.isSliceStale({
      slice: currentSlice,
      worldId: activeWorld.id,
      worldUpdatedAt: activeWorld.updatedAt.toISOString(),
      storyInputDigest: digest,
    });
    if (!stale) {
      return currentSlice;
    }
    const nextSlice = await this.invokeSliceModel({
      novel,
      activeWorld,
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
    const activeWorld = await this.getActiveWorldSource(novel);
    const storedOverrides = parseStoryWorldSliceOverrides(
      activeWorld?.storySliceOverridesJson ?? novel.storyWorldSliceOverridesJson,
    );
    const overrides = normalizeOverrides(options.overrides ?? storedOverrides);
    if (!activeWorld) {
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
      activeWorld,
      storyInput,
      overrides,
      builderMode: options.builderMode ?? "manual_refresh",
      provider: options.provider,
      model: options.model,
      temperature: options.temperature,
    });
    await this.persistSlice(novelId, slice, overrides);

    const parsedPayload = parseWorldStructurePayload(activeWorld.structureJson, activeWorld.bindingSupportJson);
    const structure = parsedPayload.hasStructuredData
      ? parsedPayload.structure
      : novel.world
        ? buildWorldStructureFromLegacySource(novel.world)
        : null;

    return buildStoryWorldSliceView({
      worldId: activeWorld.id,
      worldName: activeWorld.name,
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
    const activeWorld = await this.getActiveWorldSource(novel);
    const overrides = normalizeOverrides(overridesInput);
    if (!activeWorld) {
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
