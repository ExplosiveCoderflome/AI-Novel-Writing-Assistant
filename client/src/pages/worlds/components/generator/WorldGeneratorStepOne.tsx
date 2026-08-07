import { useState } from "react";
import type { WorldOptionRefinementLevel, WorldReferenceAnchor, WorldReferenceMode } from "@ai-novel/shared/types/worldWizard";
import { Button } from "@/components/ui/button";
import KnowledgeDocumentPicker from "@/components/knowledge/KnowledgeDocumentPicker";
import type {
  GeneratorGenreOption,
  InspirationMode,
  WorldGeneratorConceptCard,
} from "./worldGeneratorShared";
import { REFERENCE_MODE_OPTIONS } from "./worldGeneratorShared";
import SelectControl from "@/components/common/SelectControl";

const INSPIRATION_MODE_CARDS: Array<{
  value: InspirationMode;
  title: string;
  description: string;
}> = [
  {
    value: "free",
    title: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    description: "World samples suitable for existing themes, temperaments, or story stage ideas.",
  },
  {
    value: "reference",
    title: "Refinement of reference works",
    description: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
  },
  {
    value: "random",
    title: "Let AI give direction",
    description: "I don’t have a clear idea yet, I just want to get a prototype of a usable world first.",
  },
];

interface WorldGeneratorStepOneProps {
  worldName: string;
  selectedGenreId: string;
  selectedGenre: GeneratorGenreOption | null;
  genreOptions: GeneratorGenreOption[];
  genreLoading: boolean;
  inspirationMode: InspirationMode;
  referenceMode: WorldReferenceMode;
  selectedKnowledgeDocumentIds: string[];
  preserveText: string;
  allowedChangesText: string;
  forbiddenText: string;
  inspirationText: string;
  optionRefinementLevel: WorldOptionRefinementLevel;
  optionsCount: number;
  canAnalyze: boolean;
  analyzeStreaming: boolean;
  analyzeButtonLabel: string;
  analyzeProgressMessage?: string;
  inspirationSourceMeta: {
    extracted: boolean;
    originalLength: number;
    chunkCount: number;
  } | null;
  concept: WorldGeneratorConceptCard | null;
  propertyOptionsCount: number;
  referenceAnchors: WorldReferenceAnchor[];
  onWorldNameChange: (value: string) => void;
  onGenreChange: (value: string) => void;
  onOpenGenreManager: () => void;
  onInspirationModeChange: (value: InspirationMode) => void;
  onKnowledgeDocumentIdsChange: (ids: string[]) => void;
  onReferenceModeChange: (value: WorldReferenceMode) => void;
  onPreserveTextChange: (value: string) => void;
  onAllowedChangesTextChange: (value: string) => void;
  onForbiddenTextChange: (value: string) => void;
  onInspirationTextChange: (value: string) => void;
  onOptionRefinementLevelChange: (value: WorldOptionRefinementLevel) => void;
  onOptionsCountChange: (value: number) => void;
  onAnalyze: () => void;
}

export default function WorldGeneratorStepOne(props: WorldGeneratorStepOneProps) {
  const {
    worldName,
    selectedGenreId,
    selectedGenre,
    genreOptions,
    genreLoading,
    inspirationMode,
    referenceMode,
    selectedKnowledgeDocumentIds,
    preserveText,
    allowedChangesText,
    forbiddenText,
    inspirationText,
    optionRefinementLevel,
    optionsCount,
    canAnalyze,
    analyzeStreaming,
    analyzeButtonLabel,
    analyzeProgressMessage,
    inspirationSourceMeta,
    concept,
    propertyOptionsCount,
    referenceAnchors,
    onWorldNameChange,
    onGenreChange,
    onOpenGenreManager,
    onInspirationModeChange,
    onKnowledgeDocumentIdsChange,
    onReferenceModeChange,
    onPreserveTextChange,
    onAllowedChangesTextChange,
    onForbiddenTextChange,
    onInspirationTextChange,
    onOptionRefinementLevelChange,
    onOptionsCountChange,
    onAnalyze,
  } = props;

  const isReferenceMode = inspirationMode === "reference";
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-background p-4 space-y-3">
        <div>
          <div className="text-sm font-medium">这个世界先叫什么？</div>
          <div className="mt-1 text-xs text-muted-foreground">
            The name can be left blank, and the system will first create a world sample that can be further organized.
                                </div>
        </div>
        <input
          className="w-full rounded-md border p-2 text-sm"
          placeholder="For example: Zixia Realm, Ashes Dynasty, Yuxiang Old City"
          value={worldName}
          onChange={(event) => onWorldNameChange(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <div>
          <div className="text-sm font-medium">Choose a theme base</div>
          <div className="mt-1 text-xs text-muted-foreground">
            The subject matter base determines the reader's expectations, power rules, and common conflicts of the world.
                                </div>
        </div>
        <SelectControl
          className="w-full rounded-md border bg-background p-2 text-sm"
          value={selectedGenreId}
          disabled={genreLoading || genreOptions.length === 0}
          onChange={(event) => onGenreChange(event.target.value)}
        >
          <option value="">{genreLoading ? "Loading theme base..." : "Please select theme base"}</option>
          {genreOptions.map((genre) => (
            <option key={genre.id} value={genre.id}>
              {genre.path}
            </option>
          ))}
        </SelectControl>
        {selectedGenre ? (
          <div className="rounded-md border p-3 text-xs text-muted-foreground space-y-1">
            <div>Current theme base path:{selectedGenre.path}</div>
            {selectedGenre.description?.trim() ? <div>题材基底说明：{selectedGenre.description.trim()}</div> : null}
            {selectedGenre.template?.trim() ? (
              <div className="whitespace-pre-wrap">Theme base template:{selectedGenre.template.trim()}</div>
            ) : null}
          </div>
        ) : null}
        {genreLoading ? <div className="text-xs text-muted-foreground">Loading theme base tree...</div> : null}
          {!genreLoading && genreOptions.length === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground space-y-2">
            <div>The theme base library is empty. Creating a world sample requires first preparing an optional theme base.</div>
            <Button type="button" variant="outline" onClick={onOpenGenreManager}>
              Go to the theme base library
                                      </Button>
          </div>
        ) : null}
        <div className="text-xs text-muted-foreground">
          First determine the theme base, then generate concept cards, world attributes and subsequent skeleton selection.
                          </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Choose how to create</div>
        <div className="grid gap-3 md:grid-cols-3">
          {INSPIRATION_MODE_CARDS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={[
                "rounded-md border p-3 text-left transition-colors",
                inspirationMode === item.value ? "border-primary bg-primary/5" : "border-border/70 bg-background hover:bg-muted/40",
              ].join(" ")}
              onClick={() => onInspirationModeChange(item.value)}
            >
              <div className="text-sm font-medium text-foreground">{item.title}</div>
              <div className="mt-2 text-xs text-muted-foreground">{item.description}</div>
            </button>
          ))}
        </div>
      </div>

      {isReferenceMode ? (
        <div className="space-y-3">
          <KnowledgeDocumentPicker
            selectedIds={selectedKnowledgeDocumentIds}
            onChange={(next) => onKnowledgeDocumentIdsChange(next ?? [])}
            title="Reference knowledge base documentation"
            description="The reference source is selected here. Later, the original world anchor point will be extracted first, and then the overhead transformation direction will be generated."
            queryStatus="enabled"
          />

          <div className="rounded-md border p-3 text-sm space-y-2">
            <div className="font-medium">Reference method</div>
            <SelectControl
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={referenceMode}
              onChange={(event) => onReferenceModeChange(event.target.value as WorldReferenceMode)}
            >
              {REFERENCE_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectControl>
            <div className="text-xs text-muted-foreground">
              {REFERENCE_MODE_OPTIONS.find((item) => item.value === referenceMode)?.description}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border p-3 text-sm space-y-2">
              <div className="font-medium">must be retained</div>
              <textarea
                className="min-h-[120px] w-full rounded-md border p-2 text-sm"
                placeholder="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
                value={preserveText}
                onChange={(event) => onPreserveTextChange(event.target.value)}
              />
            </div>

            <div className="rounded-md border p-3 text-sm space-y-2">
              <div className="font-medium">Allow transformation</div>
              <textarea
                className="min-h-[120px] w-full rounded-md border p-2 text-sm"
                placeholder="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
                value={allowedChangesText}
                onChange={(event) => onAllowedChangesTextChange(event.target.value)}
              />
            </div>

            <div className="rounded-md border p-3 text-sm space-y-2">
              <div className="font-medium">No deviation</div>
              <textarea
                className="min-h-[120px] w-full rounded-md border p-2 text-sm"
                placeholder="For example: don’t be extraordinary, don’t have a passionate upgrade flow, don’t be divorced from the logic of real society"
                value={forbiddenText}
                onChange={(event) => onForbiddenTextChange(event.target.value)}
              />
            </div>
          </div>
        </div>
      ) : null}

      <textarea
        className="min-h-[180px] w-full rounded-md border p-2 text-sm"
        placeholder={
          isReferenceMode
            ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
            : inspirationMode === "random"
              ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
              : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
        }
        value={inspirationText}
        onChange={(event) => onInspirationTextChange(event.target.value)}
      />

      <div className="rounded-md border p-3 text-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-medium">Generate preferences</div>
            <div className="mt-1 text-xs text-muted-foreground">
              By default, 6 standard world attributes are given and usually do not need to be adjusted.
                                      </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setPreferencesOpen((value) => !value)}>
            {preferencesOpen ? "Collapse preferences" : "Adjust preferences"}
          </Button>
        </div>
        {preferencesOpen ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <div className="font-medium">Attribute refinement</div>
              <SelectControl
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={optionRefinementLevel}
                onChange={(event) => onOptionRefinementLevelChange(event.target.value as WorldOptionRefinementLevel)}
              >
                <option value="basic">Basics</option>
                <option value="standard">standard</option>
                <option value="detailed">detailed</option>
              </SelectControl>
            </div>
            <div className="space-y-2">
              <div className="font-medium">Number of world attributes</div>
              <input
                className="w-full rounded-md border p-2 text-sm"
                type="number"
                min={4}
                max={8}
                value={optionsCount}
                onChange={(event) => onOptionsCountChange(Number(event.target.value) || 6)}
              />
            </div>
          </div>
        ) : null}
      </div>

      <Button onClick={onAnalyze} disabled={!canAnalyze}>
        {analyzeButtonLabel}
      </Button>

      {analyzeStreaming ? (
        <div className="rounded-md border p-3 text-sm space-y-1">
          <div className="font-medium">Current progress</div>
          <div>{analyzeProgressMessage ?? "Starting analysis..."}</div>
          <div className="text-xs text-muted-foreground">
            {isReferenceMode ? "This step will execute in sequence: organize reference materials, extract anchor points from the original world, and generate fictional modification decisions." : "This step will execute in sequence: organize inspiration input, generate concept cards, and generate prerequisite attribute options."}
          </div>
        </div>
      ) : null}

      {inspirationSourceMeta?.extracted ? (
        <div className="text-xs text-muted-foreground">
          Automatically extracted in sections: original text {inspirationSourceMeta.originalLength} characters, segmentation {inspirationSourceMeta.chunkCount} part.
                          </div>
      ) : null}

      {concept ? (
        <div className="rounded-md border p-3 text-sm space-y-2">
          <div className="font-medium">{isReferenceMode ? "Reference Analysis Summary" : "Concept Card"}</div>
          <div>type:{concept.worldType}</div>
          <div>keynote:{concept.tone}</div>
          <div>Keywords:{concept.keywords.join(" / ") || "-"}</div>
          <div>Pre-property options:{propertyOptionsCount}</div>
          {isReferenceMode && referenceAnchors.length > 0 ? (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Original World Anchor</div>
              {referenceAnchors.map((anchor) => (
                <div key={anchor.id} className="text-xs text-muted-foreground">
                  {anchor.label}：{anchor.content}
                </div>
              ))}
            </div>
          ) : null}
          <div className="whitespace-pre-wrap">{concept.summary}</div>
        </div>
      ) : null}
    </div>
  );
}
