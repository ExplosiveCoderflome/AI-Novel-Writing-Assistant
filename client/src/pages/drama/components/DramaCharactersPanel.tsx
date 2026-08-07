import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ImageIcon, Loader2, Mic2, Save, UserRound, Video } from "lucide-react";
import type {
  DramaCharacter,
  DramaCharacterLibraryItem,
  DramaCharacterPortraitData,
  DramaProjectDetail,
} from "@/api/drama";
import {
  generateDramaCharacterPortrait,
  prepareDramaCharacterSheet,
} from "@/api/drama";
import { getAPIKeySettings } from "@/api/settings";
import { ImageGenerationConfirmDialog } from "@/components/image/ImageGenerationConfirmDialog";
import { useImageGenerationFlow } from "@/components/image/useImageGenerationFlow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import SelectControl from "@/components/common/SelectControl";

export interface DramaCharacterAssetInput {
  name: string;
  screenRole: string;
  audienceRead: string;
  lineRule: string;
  visualAnchor: string;
  voiceAnchor: string;
  relationMap: string;
}

function storedText(value: string | null | undefined, preferredKeys: string[] = []): string {
  if (!value?.trim()) {
    return "";
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed === "string") {
      return parsed;
    }
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      for (const key of preferredKeys) {
        const candidate = record[key];
        if (typeof candidate === "string" && candidate.trim()) {
          return candidate.trim();
        }
      }
      return Object.values(record)
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .join("；");
    }
  } catch {
    return value;
  }
  return value;
}

function buildDraft(character: DramaCharacter): DramaCharacterAssetInput {
  return {
    name: character.name,
    screenRole: character.archetype ?? "",
    audienceRead: character.persona ?? "",
    lineRule: character.speechStyle ?? "",
    visualAnchor: storedText(character.visualAnchor, ["hint", "visualAnchor", "look", "wardrobe"]),
    voiceAnchor: storedText(character.voiceProfile, ["voice", "performance", "tone"]),
    relationMap: storedText(character.relations, ["conflict", "relations", "map"]),
  };
}

function assetCompleteness(draft: DramaCharacterAssetInput) {
  const items = [
    { key: "screenRole", label: "Appearance function", done: Boolean(draft.screenRole.trim()) },
    { key: "audienceRead", label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", done: Boolean(draft.audienceRead.trim()) },
    { key: "visualAnchor", label: "shape anchor point", done: Boolean(draft.visualAnchor.trim()) },
    { key: "voiceAnchor", label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", done: Boolean(draft.voiceAnchor.trim()) },
    { key: "lineRule", label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", done: Boolean(draft.lineRule.trim()) },
  ];
  return {
    items,
    done: items.filter((item) => item.done).length,
    total: items.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 角色图片展示与生成
// ─────────────────────────────────────────────────────────────────────────────

function parsePortrait(raw: string | null | undefined): DramaCharacterPortraitData {
  if (!raw) return { status: "idle" };
  try { return JSON.parse(raw) as DramaCharacterPortraitData; } catch { return { status: "idle" }; }
}


function CharacterImagesBlock(props: {
  projectId: string;
  character: DramaCharacter;
  onRefresh: () => void;
}) {
  const [sheet, setSheet] = useState<DramaCharacterPortraitData>(() =>
    parsePortrait(props.character.portraitData),
  );
  const [busy, setBusy] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("");
  const imageFlow = useImageGenerationFlow();

  const apiKeyQuery = useQuery({
    queryKey: ["api-key-settings"],
    queryFn: getAPIKeySettings,
    staleTime: 60_000,
  });

  const imageProviders = useMemo(
    () =>
      (apiKeyQuery.data?.data ?? []).filter(
        (item) => item.isActive && item.isConfigured && item.supportsImageGeneration && item.currentImageModel,
      ),
    [apiKeyQuery.data?.data],
  );

  useEffect(() => {
    if (imageProviders.length > 0 && !selectedProvider) {
      setSelectedProvider(imageProviders[0]!.provider);
    }
  }, [imageProviders, selectedProvider]);

  useEffect(() => {
    setSheet(parsePortrait(props.character.portraitData));
  }, [props.character.portraitData]);

  function handleGenerate() {
    imageFlow.start({
      prepare: async () => {
        const result = await prepareDramaCharacterSheet(props.projectId, props.character.id, selectedProvider || undefined);
        return result.data!;
      },
      generate: async (overrides) => {
        setBusy(true);
        setSheet((current) => ({
          status: "generating",
          provider: selectedProvider || current.provider,
          version: current.status === "done" ? (current.version ?? 1) + 1 : current.version,
          history: current.history,
        }));
        try {
          const result = await generateDramaCharacterPortrait(
            props.projectId,
            props.character.id,
            selectedProvider || undefined,
            overrides,
          );
          setSheet(result.data ?? { status: "error", error: "No results" });
          return result;
        } catch (error) {
          setSheet({ status: "error", error: error instanceof Error ? error.message : "Build failed" });
          throw error;
        } finally {
          setBusy(false);
        }
      },
      onSuccess: () => props.onRefresh(),
    });
  }

  const isGenerating = imageFlow.dialogProps.loading || imageFlow.dialogProps.submitting || busy || sheet.status === "generating";

  return (
    <div className="space-y-3 border-t pt-3">
      <ImageGenerationConfirmDialog {...imageFlow.dialogProps} />
      {/* 标题行 + Provider 选择器 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Character design draft</p>
          <p className="text-xs text-muted-foreground">Facial close-up + full body front/side/back three-dimensional view — after generation, cross-set visual consistency is locked</p>
        </div>
        {imageProviders.length > 0 ? (
          <SelectControl
            className="h-7 rounded-md border bg-background px-2 text-xs"
            value={selectedProvider}
            disabled={isGenerating}
            onChange={(event) => setSelectedProvider(event.target.value)}
          >
            {imageProviders.map((item) => (
              <option key={item.provider} value={item.provider}>
                {item.name} · {item.currentImageModel}
              </option>
            ))}
          </SelectControl>
        ) : (
          <span className="text-xs text-destructive">Please configure the image generation Provider in the settings first</span>
        )}
      </div>

      {/* 设计稿预览 — 横版大图 */}
      {sheet.status === "done" && sheet.url ? (
        <a href={sheet.url} target="_blank" rel="noreferrer" className="block">
          <img
            src={sheet.url}
            alt={`${props.character.name} 角色设计稿`}
            className="w-full rounded-md border object-contain shadow-sm"
            style={{ maxHeight: "240px" }}
          />
        </a>
      ) : (
        <div
          className="flex w-full items-center justify-center rounded-md border border-dashed bg-muted text-muted-foreground"
          style={{ height: "140px" }}
        >
          {sheet.status === "generating" ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-xs">Generating character design draft...</span>
            </div>
          ) : sheet.status === "error" ? (
            <div className="flex flex-col items-center gap-1 px-4 text-center">
              <ImageIcon className="h-5 w-5 text-destructive" />
              <span className="text-xs text-destructive">{sheet.error ?? "Build failed"}</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <ImageIcon className="h-6 w-6" />
              <span className="text-xs">Not yet generated</span>
            </div>
          )}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={sheet.status === "done" ? "outline" : "default"}
          disabled={isGenerating || imageProviders.length === 0}
          onClick={handleGenerate}
        >
          {isGenerating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImageIcon className="h-3.5 w-3.5" />
          )}
          {sheet.status === "done" ? "Regenerate design draft" : "Generate character design draft"}
        </Button>
        {sheet.status === "done" && (
          <>
            <Badge variant="outline">v{sheet.version ?? 1}</Badge>
            <span className="text-xs text-muted-foreground">Video generation will automatically reference this image as a character reference</span>
          </>
        )}
        {sheet.history?.length ? <Badge variant="secondary">{sheet.history.length} historical version</Badge> : null}
      </div>
      <CharacterImageHistory history={sheet.history ?? []} />
    </div>
  );
}

function formatLocalTime(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function CharacterImageHistory({ history }: { history: NonNullable<DramaCharacterPortraitData["history"]> }) {
  if (!history.length) {
    return null;
  }
  const items = [...history].sort((left, right) => right.version - left.version);
  return (
    <div className="rounded-md border border-dashed p-3 text-xs">
      <div className="mb-2 font-medium">Historical versions of design drafts</div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const label = `v${item.version}${item.provider ? ` · ${item.provider}` : ""}`;
          return item.url ? (
            <a
              key={`${item.version}-${item.url}`}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border px-2 py-1 text-primary underline-offset-4 hover:underline"
              title={formatLocalTime(item.generatedAt)}
            >
              {label}
            </a>
          ) : (
            <span key={item.version} className="rounded-md border px-2 py-1 text-muted-foreground" title={formatLocalTime(item.generatedAt)}>
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function CharacterAssetEditor(props: {
  projectId: string;
  character: DramaCharacter;
  busy: boolean;
  onSave: (character: DramaCharacter, input: DramaCharacterAssetInput) => void;
  onSaveToLibrary: (character: DramaCharacter) => void;
  onRefreshCharacter: () => void;
}) {
  const [draft, setDraft] = useState<DramaCharacterAssetInput>(() => buildDraft(props.character));

  useEffect(() => {
    setDraft(buildDraft(props.character));
  }, [
    props.character.id,
    props.character.name,
    props.character.archetype,
    props.character.persona,
    props.character.speechStyle,
    props.character.visualAnchor,
    props.character.voiceProfile,
    props.character.relations,
  ]);

  const completeness = useMemo(() => assetCompleteness(draft), [draft]);

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserRound className="h-4 w-4" />
              {props.character.name}
            </CardTitle>
            <CardDescription>{draft.screenRole || "First, clarify the role of this character in the short play."}</CardDescription>
          </div>
          <Badge variant={completeness.done >= 4 ? "default" : "secondary"}>
            assets {completeness.done}/{completeness.total}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Appearance</span>
            <input
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Skit function</span>
            <input
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={draft.screenRole}
              placeholder="Protagonist/Villain/Resistance Character/Assist/Emotional Object"
              onChange={(event) => setDraft((current) => ({ ...current, screenRole: event.target.value }))}
            />
          </label>
        </div>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">What should the audience understand at first glance?</span>
          <textarea
            className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={draft.audienceRead}
            placeholder="For example: She appears to be humiliated in a low position, but her eyes are always calm. The audience must immediately believe that she has a trump card to fight back."
            onChange={(event) => setDraft((current) => ({ ...current, audienceRead: event.target.value }))}
          />
        </label>

        <div className="grid gap-3 lg:grid-cols-2">
          <label className="block space-y-1.5 text-sm">
            <span className="flex items-center gap-1 font-medium">
              <Video className="h-4 w-4" />
              Fixed shape anchor point
                                      </span>
            <textarea
              className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={draft.visualAnchor}
              placeholder="Appearance, hairstyle, clothing, personal belongings, and commonly used colors; subsequent storyboards and video prompts will be used."
              onChange={(event) => setDraft((current) => ({ ...current, visualAnchor: event.target.value }))}
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="flex items-center gap-1 font-medium">
              <Mic2 className="h-4 w-4" />
              Performance and sound anchors
                                      </span>
            <textarea
              className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={draft.voiceAnchor}
              placeholder="Speech speed, timbre, expression habits, and emotional outburst methods; used to match lines and video performances."
              onChange={(event) => setDraft((current) => ({ ...current, voiceAnchor: event.target.value }))}
            />
          </label>
        </div>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</span>
          <textarea
            className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={draft.lineRule}
            placeholder="For example: short sentences, less explanation, and more rhetorical questions; don’t rush to defend when being humiliated, and drop the hammer in one sentence when fighting back."
            onChange={(event) => setDraft((current) => ({ ...current, lineRule: event.target.value }))}
          />
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Conflict relationships and lens matching</span>
          <textarea
            className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={draft.relationMap}
            placeholder="Who does this character mainly play against, who does he suppress, who does he protect, and how is he suitable to be in the same frame?"
            onChange={(event) => setDraft((current) => ({ ...current, relationMap: event.target.value }))}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={props.busy} onClick={() => props.onSave(props.character, draft)}>
            <Save className="h-4 w-4" />
            Save character assets
                                </Button>
          <Button type="button" size="sm" variant="outline" disabled={props.busy} onClick={() => props.onSaveToLibrary(props.character)}>
            Save to short play character library
                                </Button>
        </div>

        <CharacterImagesBlock
          projectId={props.projectId}
          character={props.character}
          onRefresh={props.onRefreshCharacter}
        />
      </CardContent>
    </Card>
  );
}

export function DramaCharactersPanel(props: {
  project: DramaProjectDetail;
  library: DramaCharacterLibraryItem[];
  busy: boolean;
  onSave: (character: DramaCharacter, input: DramaCharacterAssetInput) => void;
  onSaveToLibrary: (character: DramaCharacter) => void;
  onImportFromLibrary: (libraryId: string) => void;
  onRefreshProject: () => void;
}) {
  const characters = props.project.characters ?? [];
  const [selectedLibraryId, setSelectedLibraryId] = useState("");

  return (
    <div className="space-y-4">
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-lg">Short drama character assets</CardTitle>
          <CardDescription>Character assets will be included in the script, storyboards, and video prompts, with priority given to ensuring audience recognition, consistent styling, and filmable lines.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <SelectControl
            className="h-10 min-w-[260px] rounded-md border bg-background px-3 text-sm"
            value={selectedLibraryId}
            disabled={props.busy || props.library.length === 0}
            onChange={(event) => setSelectedLibraryId(event.target.value)}
          >
            <option value="" disabled>{props.library.length > 0 ? "Select skit character assets" : "There are currently no character assets to import."}</option>
            {props.library.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}{item.archetype ? ` · ${item.archetype}` : ""}
              </option>
            ))}
          </SelectControl>
          <Button
            type="button"
            variant="outline"
            disabled={props.busy || !selectedLibraryId}
            onClick={() => props.onImportFromLibrary(selectedLibraryId)}
          >
            <Download className="h-4 w-4" />
            Import character assets
                                </Button>
        </CardContent>
      </Card>

      {characters.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">After organizing the materials, the main characters will be automatically imported, and then the styling, performance and line anchor points will be completed.</div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {characters.map((character) => (
            <CharacterAssetEditor
              key={character.id}
              projectId={props.project.id}
              character={character}
              busy={props.busy}
              onSave={props.onSave}
              onSaveToLibrary={props.onSaveToLibrary}
              onRefreshCharacter={props.onRefreshProject}
            />
          ))}
        </div>
      )}
    </div>
  );
}
