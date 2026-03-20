import type { WorldOptionRefinementLevel, WorldReferenceAnchor, WorldReferenceMode } from "@ai-novel/shared/types/worldWizard";
import { Button } from "@/components/ui/button";
import KnowledgeDocumentPicker from "@/components/knowledge/KnowledgeDocumentPicker";
import type {
  GeneratorGenreOption,
  InspirationMode,
  WorldGeneratorConceptCard,
} from "./worldGeneratorShared";
import { REFERENCE_MODE_OPTIONS } from "./worldGeneratorShared";

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

  return (
    <div className="space-y-3">
      <input
        className="w-full rounded-md border p-2 text-sm"
        placeholder="世界名称（可选）"
        value={worldName}
        onChange={(event) => onWorldNameChange(event.target.value)}
      />

      <div className="space-y-2">
        <div className="text-sm font-medium">世界类型</div>
        <select
          className="w-full rounded-md border bg-background p-2 text-sm"
          value={selectedGenreId}
          disabled={genreLoading || genreOptions.length === 0}
          onChange={(event) => onGenreChange(event.target.value)}
        >
          <option value="">{genreLoading ? "正在加载类型..." : "请选择通用类型"}</option>
          {genreOptions.map((genre) => (
            <option key={genre.id} value={genre.id}>
              {genre.path}
            </option>
          ))}
        </select>
        {selectedGenre ? (
          <div className="rounded-md border p-3 text-xs text-muted-foreground space-y-1">
            <div>当前类型路径：{selectedGenre.path}</div>
            {selectedGenre.description?.trim() ? <div>类型说明：{selectedGenre.description.trim()}</div> : null}
            {selectedGenre.template?.trim() ? (
              <div className="whitespace-pre-wrap">类型模板：{selectedGenre.template.trim()}</div>
            ) : null}
          </div>
        ) : null}
        {genreLoading ? <div className="text-xs text-muted-foreground">正在加载通用类型树...</div> : null}
        {!genreLoading && genreOptions.length === 0 ? (
          <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground space-y-2">
            <div>当前还没有可用类型。世界观向导会统一使用通用类型管理。</div>
            <Button type="button" variant="outline" onClick={onOpenGenreManager}>
              去类型管理
            </Button>
          </div>
        ) : null}
        <div className="text-xs text-muted-foreground">
          这里直接复用通用类型管理，不再使用模板内置类型列表作为入口。
        </div>
        <div className="text-xs text-muted-foreground">
          先确定题材类型，再生成概念卡、前置属性和后续模板筛选。
        </div>
      </div>

      <select
        className="w-full rounded-md border bg-background p-2 text-sm"
        value={inspirationMode}
        onChange={(event) => onInspirationModeChange(event.target.value as InspirationMode)}
      >
        <option value="free">自由输入</option>
        <option value="reference">参考作品</option>
        <option value="random">随机灵感</option>
      </select>

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
            <select
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={referenceMode}
              onChange={(event) => onReferenceModeChange(event.target.value as WorldReferenceMode)}
            >
              {REFERENCE_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
            : "描述你的世界灵感"
        }
        value={inspirationText}
        onChange={(event) => onInspirationTextChange(event.target.value)}
      />

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border p-3 text-sm space-y-2">
          <div className="font-medium">属性选项细化程度</div>
          <select
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={optionRefinementLevel}
            onChange={(event) => onOptionRefinementLevelChange(event.target.value as WorldOptionRefinementLevel)}
          >
            <option value="basic">基础</option>
            <option value="standard">标准</option>
            <option value="detailed">详细</option>
          </select>
        </div>

        <div className="rounded-md border p-3 text-sm space-y-2">
          <div className="font-medium">生成前置属性数量</div>
          <input
            className="w-full rounded-md border p-2 text-sm"
            type="number"
            min={4}
            max={8}
            value={optionsCount}
            onChange={(event) => onOptionsCountChange(Number(event.target.value) || 6)}
          />
          <div className="text-xs text-muted-foreground">
            这一步会参考旧版 V2 的思路，先生成可选择的世界属性，再进入正式创建。
          </div>
        </div>
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
