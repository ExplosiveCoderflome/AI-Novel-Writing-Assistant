import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
    title: t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.startFromInspiration"),
    description: t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_80a88384"),
  },
  {
    value: "reference",
    title: t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_0dd7d8a2"),
    description: t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_fd5e12ca"),
  },
  {
    value: "random",
    title: t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_3e7a5205"),
    description: t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_1f434df6"),
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
          <div className="text-sm font-medium">{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_c250dfe1")}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            名称可以留空，系统会先创建一份可继续整理的世界样本。
          </div>
        </div>
        <input
          className="w-full rounded-md border p-2 text-sm"
          placeholder={t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.examplePurpleSkyRealmAshKingdomRainAlleyOldCity")}
          value={worldName}
          onChange={(event) => onWorldNameChange(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <div>
          <div className="text-sm font-medium">{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_f994b83c")}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            题材基底决定世界的读者预期、力量规则和常见冲突。
          </div>
        </div>
        <SelectControl
          className="w-full rounded-md border bg-background p-2 text-sm"
          value={selectedGenreId}
          disabled={genreLoading || genreOptions.length === 0}
          onChange={(event) => onGenreChange(event.target.value)}
        >
          <option value="">{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.genreLoadingText")}</option>
          {genreOptions.map((genre) => (
            <option key={genre.id} value={genre.id}>
              {genre.path}
            </option>
          ))}
        </SelectControl>
        {selectedGenre ? (
          <div className="rounded-md border p-3 text-xs text-muted-foreground space-y-1">
            <div>{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_5f4ffa69")}</div>
            {selectedGenre.description?.trim() ? <div>{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_dbbeaadd")}</div> : null}
            {selectedGenre.template?.trim() ? (
              <div className="whitespace-pre-wrap">{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_b0221764")}</div>
            ) : null}
          </div>
        ) : null}
        {genreLoading ? <div className="text-xs text-muted-foreground">{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_8ca5aa71")}</div> : null}
          {!genreLoading && genreOptions.length === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground space-y-2">
            <div>{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_ce68b833")}</div>
            <Button type="button" variant="outline" onClick={onOpenGenreManager}>
              去题材基底库
            </Button>
          </div>
        ) : null}
        <div className="text-xs text-muted-foreground">
          先确定题材基底，再生成概念卡、世界属性和后续骨架选择。
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_54757591")}</div>
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
            title={t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_d7b79c91")}
            description={t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_5b93ccba")}
            queryStatus="enabled"
          />

          <div className="rounded-md border p-3 text-sm space-y-2">
            <div className="font-medium">{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_56ba9d71")}</div>
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
              <div className="font-medium">{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_3443f3cf")}</div>
              <textarea
                className="min-h-[120px] w-full rounded-md border p-2 text-sm"
                placeholder={t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.exampleRealityUrbanBasisRentLivingQualityAdultEmotionalTug")}
                value={preserveText}
                onChange={(event) => onPreserveTextChange(event.target.value)}
              />
            </div>

            <div className="rounded-md border p-3 text-sm space-y-2">
              <div className="font-medium">{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_2f99624a")}</div>
              <textarea
                className="min-h-[120px] w-full rounded-md border p-2 text-sm"
                placeholder={t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.exampleCityLevelSocialRulesPowerNetworkLocationSystem")}
                value={allowedChangesText}
                onChange={(event) => onAllowedChangesTextChange(event.target.value)}
              />
            </div>

            <div className="rounded-md border p-3 text-sm space-y-2">
              <div className="font-medium">{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_26180712")}</div>
              <textarea
                className="min-h-[120px] w-full rounded-md border p-2 text-sm"
                placeholder={t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.exampleAvoidSuperNaturalHeatUpgradeLogic")}
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
            ? t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_b153714d")
            : inspirationMode === "random"
              ? t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_b62670d3")
              : t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_e7057777")
        }
        value={inspirationText}
        onChange={(event) => onInspirationTextChange(event.target.value)}
      />

      <div className="rounded-md border p-3 text-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-medium">{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_dd477c7b")}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              默认会给出 6 个标准世界属性，通常不用调整。
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setPreferencesOpen((value) => !value)}>
            {preferencesOpen ? t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_b91f3d0f") : t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_8af07582")}
          </Button>
        </div>
        {preferencesOpen ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <div className="font-medium">{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_45b91e77")}</div>
              <SelectControl
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={optionRefinementLevel}
                onChange={(event) => onOptionRefinementLevelChange(event.target.value as WorldOptionRefinementLevel)}
              >
                <option value="basic">{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_0796ba76")}</option>
                <option value="standard">{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_544fac40")}</option>
                <option value="detailed">{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_1f0a3a1c")}</option>
              </SelectControl>
            </div>
            <div className="space-y-2">
              <div className="font-medium">{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.worldAttributeCount")}</div>
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
          <div className="font-medium">{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_75ea7b29")}</div>
          <div>{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_analyzePro_dsqa")}</div>
          <div className="text-xs text-muted-foreground">
            {isReferenceMode
              ? t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_fbd39c55")
              : t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_8f40e0b9")}
          </div>
        </div>
      ) : null}

      {inspirationSourceMeta?.extracted ? (
        <div className="text-xs text-muted-foreground">
          已自动分段提取：原文 {inspirationSourceMeta.originalLength} 字符，切分 {inspirationSourceMeta.chunkCount} 段。
        </div>
      ) : null}

      {concept ? (
        <div className="rounded-md border p-3 text-sm space-y-2">
          <div className="font-medium">{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.referenceType")}</div>
          <div>{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_92f79e03")}</div>
          <div>{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_a379c3ce")}</div>
          <div>{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_f7f6cfee")}</div>
          <div>{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_b8f334d9")}</div>
          {isReferenceMode && referenceAnchors.length > 0 ? (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">{t("gen.pages.worlds.components.generator.WorldGeneratorStepOne.gen_81c19e9b")}</div>
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
