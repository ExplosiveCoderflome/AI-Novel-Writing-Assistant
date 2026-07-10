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
    title: "从一句灵感开始",
    description: "适合已有题材、气质或故事舞台想法的世界样本。",
  },
  {
    value: "reference",
    title: "参考作品改造",
    description: "适合借鉴已有作品的质感，再生成独立的架空世界。",
  },
  {
    value: "random",
    title: "让 AI 给方向",
    description: "适合还没有明确想法，只想先获得一个可用世界雏形。",
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
            名称可以留空，系统会先创建一份可继续整理的世界样本。
          </div>
        </div>
        <input
          className="w-full rounded-md border p-2 text-sm"
          placeholder="例如：紫霞界、灰烬王朝、雨巷旧城"
          value={worldName}
          onChange={(event) => onWorldNameChange(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <div>
          <div className="text-sm font-medium">选择题材基底</div>
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
          <option value="">{genreLoading ? "正在加载题材基底..." : "请选择题材基底"}</option>
          {genreOptions.map((genre) => (
            <option key={genre.id} value={genre.id}>
              {genre.path}
            </option>
          ))}
        </SelectControl>
        {selectedGenre ? (
          <div className="rounded-md border p-3 text-xs text-muted-foreground space-y-1">
            <div>当前题材基底路径：{selectedGenre.path}</div>
            {selectedGenre.description?.trim() ? <div>题材基底说明：{selectedGenre.description.trim()}</div> : null}
            {selectedGenre.template?.trim() ? (
              <div className="whitespace-pre-wrap">题材基底模板：{selectedGenre.template.trim()}</div>
            ) : null}
          </div>
        ) : null}
        {genreLoading ? <div className="text-xs text-muted-foreground">正在加载题材基底树...</div> : null}
          {!genreLoading && genreOptions.length === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground space-y-2">
            <div>题材基底库为空。创建世界样本需要先准备可选题材基底。</div>
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
        <div className="text-sm font-medium">选择创建方式</div>
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
            title="参考知识库文档"
            description="这里选的是参考源，后续会先提取原作世界锚点，再生成架空改造方向。"
            queryStatus="enabled"
          />

          <div className="rounded-md border p-3 text-sm space-y-2">
            <div className="font-medium">参考方式</div>
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
              <div className="font-medium">必须保留</div>
              <textarea
                className="min-h-[120px] w-full rounded-md border p-2 text-sm"
                placeholder="例如：现实都市基底、租房生活质感、成年人的情感拉扯"
                value={preserveText}
                onChange={(event) => onPreserveTextChange(event.target.value)}
              />
            </div>

            <div className="rounded-md border p-3 text-sm space-y-2">
              <div className="font-medium">允许改造</div>
              <textarea
                className="min-h-[120px] w-full rounded-md border p-2 text-sm"
                placeholder="例如：城市层级、社会规则、势力网络、地点系统"
                value={allowedChangesText}
                onChange={(event) => onAllowedChangesTextChange(event.target.value)}
              />
            </div>

            <div className="rounded-md border p-3 text-sm space-y-2">
              <div className="font-medium">禁止偏离</div>
              <textarea
                className="min-h-[120px] w-full rounded-md border p-2 text-sm"
                placeholder="例如：不要超凡化、不要热血升级流、不要脱离现实社会逻辑"
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
            ? "粘贴原作片段、世界总结或你对这部作品的理解；也可以只使用上方知识库文档"
            : inspirationMode === "random"
              ? "可选：写下你想避开的题材、喜欢的氛围或目标读者"
              : "用几句话描述世界的气质、舞台、冲突或力量来源"
        }
        value={inspirationText}
        onChange={(event) => onInspirationTextChange(event.target.value)}
      />

      <div className="rounded-md border p-3 text-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-medium">生成偏好</div>
            <div className="mt-1 text-xs text-muted-foreground">
              默认会给出 6 个标准世界属性，通常不用调整。
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setPreferencesOpen((value) => !value)}>
            {preferencesOpen ? "收起偏好" : "调整偏好"}
          </Button>
        </div>
        {preferencesOpen ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <div className="font-medium">属性细化程度</div>
              <SelectControl
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={optionRefinementLevel}
                onChange={(event) => onOptionRefinementLevelChange(event.target.value as WorldOptionRefinementLevel)}
              >
                <option value="basic">基础</option>
                <option value="standard">标准</option>
                <option value="detailed">详细</option>
              </SelectControl>
            </div>
            <div className="space-y-2">
              <div className="font-medium">世界属性数量</div>
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
          <div className="font-medium">当前进度</div>
          <div>{analyzeProgressMessage ?? "正在启动分析..."}</div>
          <div className="text-xs text-muted-foreground">
            {isReferenceMode
              ? "这一步会依次执行：整理参考材料、提取原作世界锚点、生成架空改造决策。"
              : "这一步会依次执行：整理灵感输入、生成概念卡、生成前置属性选项。"}
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
          <div className="font-medium">{isReferenceMode ? "参考分析摘要" : "概念卡"}</div>
          <div>类型：{concept.worldType}</div>
          <div>基调：{concept.tone}</div>
          <div>关键词：{concept.keywords.join(" / ") || "-"}</div>
          <div>前置属性选项：{propertyOptionsCount}</div>
          {isReferenceMode && referenceAnchors.length > 0 ? (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">原作世界锚点</div>
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
