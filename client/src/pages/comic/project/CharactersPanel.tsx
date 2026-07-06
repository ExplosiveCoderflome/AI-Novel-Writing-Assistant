import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookMarked,
  Bot,
  Image as ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  Smile,
  Sparkles,
  Trash2,
  Upload,
  User,
  Users,
  Wand2,
} from "lucide-react";
import {
  characterAssetImageUrl,
  characterExpressionImageUrl,
  characterSheetImageUrl,
  createCharacterAsset,
  deleteCharacterAsset,
  deleteComicFact,
  generateCharacterAssetImage,
  prepareCharacterAssetImage,
  prepareCharacterExpressionSheet,
  prepareCharacterSheet,
  generateCharacterExpressionSheet,
  generateCharacterSheet,
  listCharacterAssets,
  listComicFacts,
  rewriteCharacterVisualAnchor,
  updateCharacterGender,
  updateCharacterVisualAnchor,
  uploadCharacterAssetImage,
  type CharacterAssetType,
  type AssetImageData,
  type ComicCharacterAsset,
  type ComicCharacterGender,
  type CharacterExpressionData,
  type ComicFact,
  type GenerateCharacterSheetOptions,
  type CharacterSheetData,
  type ComicCharacter,
} from "@/api/comic";
import { ImageGenerationConfirmDialog } from "@/components/image/ImageGenerationConfirmDialog";
import { useImageGenerationFlow } from "@/components/image/useImageGenerationFlow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { GeneratedImageCard } from "@/components/comic/GeneratedImageCard";
import SelectControl from "@/components/common/SelectControl";

function parseSheetData(character: ComicCharacter): CharacterSheetData {
  try {
    return character.sheetData ? JSON.parse(character.sheetData) : { status: "idle" };
  } catch {
    return { status: "idle" };
  }
}

function getExpressionData(sheetData: CharacterSheetData): CharacterExpressionData {
  return sheetData.assets?.expression ?? { status: "idle" };
}

function getVisualAnchorText(character: ComicCharacter): string {
  if (!character.visualAnchor) return "";

  try {
    const parsed = JSON.parse(character.visualAnchor) as Record<string, unknown>;
    if (typeof parsed.description === "string") return parsed.description;
    if (typeof parsed.hint === "string") return parsed.hint;
  } catch {
    // Free-form visual anchors are still valid input from older projects.
  }

  return character.visualAnchor;
}

function buildRecommendedSheetPrompt(character: ComicCharacter): string {
  const visualAnchorText = getVisualAnchorText(character);
  const lines = [
    "professional character design reference sheet, single image",
    "LEFT THIRD: close-up portrait of the character's face, frontal view, detailed facial features, natural expression",
    "RIGHT TWO-THIRDS: full-body character turnaround showing three views side by side: front view, side view, back view",
    "all four views depict the SAME character with IDENTICAL costume, hairstyle, and color scheme",
    "white background, clean studio lighting, no text or watermarks",
    "manga/webtoon illustration style, clean line art, vibrant colors",
  ];
  if (character.persona) lines.push(`character personality: ${character.persona}`);
  if (visualAnchorText) lines.push(`appearance: ${visualAnchorText}`);
  lines.push("consistent character design, high quality illustration");
  return lines.join(", ");
}

function CharacterStatusBadges({
  sheetData,
  expressionData,
}: {
  sheetData: CharacterSheetData;
  expressionData: CharacterExpressionData;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={sheetData.status === "done" ? "default" : "secondary"} className="text-[11px]">
        三视图{sheetData.status === "done" ? ` v${sheetData.version ?? 1}` : "待生成"}
      </Badge>
      <Badge variant={expressionData.status === "done" ? "default" : "secondary"} className="text-[11px]">
        表情稿{expressionData.status === "done" ? ` v${expressionData.version ?? 1}` : "待生成"}
      </Badge>
    </div>
  );
}

function CharacterList({
  characters,
  selectedCharacterId,
  onSelect,
}: {
  characters: ComicCharacter[];
  selectedCharacterId: string;
  onSelect: (characterId: string) => void;
}) {
  return (
    <aside className="overflow-hidden rounded-lg border bg-background">
      <div className="border-b px-3 py-3">
        <p className="text-sm font-semibold">角色列表</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{characters.length} 个角色</p>
      </div>
      <div className="max-h-[720px] overflow-y-auto p-2">
        <div className="space-y-1">
          {characters.map((character) => {
            const sheetData = parseSheetData(character);
            const expressionData = getExpressionData(sheetData);
            const isSelected = character.id === selectedCharacterId;
            const hasSheet = sheetData.status === "done";

            return (
              <button
                key={character.id}
                type="button"
                className={[
                  "group w-full rounded-md border px-3 py-2 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isSelected ? "border-primary bg-primary/10" : "border-transparent hover:border-border hover:bg-muted/60",
                ].join(" ")}
                onClick={() => onSelect(character.id)}
              >
                <div className="flex items-start gap-2">
                  <div
                    className={[
                      "relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border",
                      isSelected ? "border-primary/30 bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                    ].join(" ")}
                  >
                    <User className="h-4 w-4" />
                    {hasSheet && (
                      <img
                        src={characterSheetImageUrl(character.id)}
                        alt={`${character.name} 头像`}
                        className="absolute inset-0 h-full w-full object-cover object-left"
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{character.name}</p>
                      {hasSheet && (
                        <span className="shrink-0 text-[10px] text-muted-foreground">v{sheetData.version ?? 1}</span>
                      )}
                    </div>
                    {character.persona && (
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {character.persona}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className={hasSheet ? "text-primary" : ""}>三视图</span>
                      <span className="text-border">/</span>
                      <span className={expressionData.status === "done" ? "text-primary" : ""}>表情稿</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

// ─── Gender Selector ──────────────────────────────────────────────────────────
// 角色性别是所有生图链路（三视图/表情稿/资产/格子图）的 GENDER LOCK 来源。
// 古风/韩漫语境里"鹅蛋脸/桃花眼"等描述男女通用，必须显式声明性别，否则模型偏向韩漫美男。

const GENDER_LABELS: Record<ComicCharacterGender, string> = {
  unknown: "未指定",
  male: "男",
  female: "女",
  other: "中性",
};

const GENDER_BADGE_STYLE: Record<ComicCharacterGender, string> = {
  unknown: "border-border bg-muted text-muted-foreground",
  male: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-300",
  female: "border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-700 dark:bg-pink-900/20 dark:text-pink-300",
  other: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-900/20 dark:text-violet-300",
};

function GenderSelector({ character }: { character: ComicCharacter }) {
  const queryClient = useQueryClient();
  const current = (character.gender ?? "unknown") as ComicCharacterGender;

  const mut = useMutation({
    mutationFn: (g: ComicCharacterGender) => updateCharacterGender(character.id, g),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comic", "project"] });
      toast.success("性别已更新，下次生图生效");
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="flex items-center gap-1">
      <SelectControl
        className={`rounded border px-1.5 py-0.5 text-[11px] leading-tight ${GENDER_BADGE_STYLE[current]} disabled:opacity-50`}
        value={current}
        disabled={mut.isPending}
        title="角色性别（GENDER LOCK）：避免生图把女画成男或反之"
        onChange={(e) => mut.mutate(e.target.value as ComicCharacterGender)}
      >
        {(Object.keys(GENDER_LABELS) as ComicCharacterGender[]).map((g) => (
          <option key={g} value={g}>{GENDER_LABELS[g]}</option>
        ))}
      </SelectControl>
    </div>
  );
}

// ─── Visual Anchor Editor ──────────────────────────────────────────────────────
// 一次编辑，所有生图（三视图/表情稿/资产/格子图）后续生成都会读新版

const FACE_PRESETS: Array<{ key: string; label: string; snippet: string }> = [
  { key: "round", label: "圆脸", snippet: "脸型圆润饱满，下巴线条柔和不尖锐，round soft face, gentle rounded jawline" },
  { key: "square", label: "方脸", snippet: "脸型方正，下颌角清晰，square face shape, defined jawline angle" },
  { key: "oval", label: "鹅蛋脸", snippet: "脸型为标准鹅蛋脸，oval face shape, balanced proportions" },
  { key: "long", label: "长脸", snippet: "脸型偏长，long face shape, vertically elongated" },
  { key: "young", label: "童颜", snippet: "面部线条柔和带婴儿肥，年龄感偏小，youthful baby face, soft cheeks" },
  { key: "mature", label: "成熟", snippet: "面部骨骼明显，气质成熟，mature defined bone structure, adult features" },
  { key: "sharp", label: "棱角分明", snippet: "颧骨与下颌线条分明，sharp cheekbones, well-defined jawline" },
  { key: "wide_eyes", label: "眼距偏宽", snippet: "双眼间距偏宽，wide-set eyes" },
  { key: "narrow_eyes", label: "丹凤眼", snippet: "眼型为细长丹凤眼，narrow phoenix eyes, upturned outer corners" },
];

function getFaceShapeOverride(character: ComicCharacter): string {
  if (!character.visualAnchor) return "";
  try {
    const parsed = JSON.parse(character.visualAnchor) as Record<string, unknown>;
    const spec = parsed.visualSpec as Record<string, unknown> | undefined;
    if (spec && typeof spec.faceShapeOverride === "string") return spec.faceShapeOverride;
  } catch { /* ignore */ }
  return "";
}

interface RewriteSuggestion {
  appearance: string;
  faceShapeOverride?: string;
  rationale: string;
}

function VisualAnchorEditor({ character }: { character: ComicCharacter }) {
  const queryClient = useQueryClient();
  const initial = getVisualAnchorText(character);
  const initialOverride = getFaceShapeOverride(character);
  const [text, setText] = useState(initial);
  const [override, setOverride] = useState(initialOverride);
  const [editing, setEditing] = useState(false);
  const [showAIBox, setShowAIBox] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [suggestion, setSuggestion] = useState<RewriteSuggestion | null>(null);

  // 切角色时重置（key 已用 character.id 重新挂载 CharacterDetail，但单独保险）
  // 注：CharacterDetail 用 key={character.id}，本组件会随之重建

  const saveMut = useMutation({
    mutationFn: () =>
      updateCharacterVisualAnchor(character.id, {
        appearance: text.trim(),
        faceShapeOverride: override.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comic", "project"] });
      toast.success("外貌锚点已保存，下次生图生效");
      setEditing(false);
    },
    onError: (e) => toast.error(String(e)),
  });

  const rewriteMut = useMutation({
    mutationFn: () =>
      rewriteCharacterVisualAnchor(character.id, {
        userInstruction: aiInstruction.trim() || undefined,
      }),
    onSuccess: (result) => {
      setSuggestion(result);
    },
    onError: (e) => toast.error(String(e)),
  });

  const adoptSuggestion = () => {
    if (!suggestion) return;
    setText(suggestion.appearance);
    if (suggestion.faceShapeOverride !== undefined) setOverride(suggestion.faceShapeOverride);
    setSuggestion(null);
    setShowAIBox(false);
    toast.success("已采用 AI 建议，请检查后保存");
  };

  const setPresetAsOverride = (snippet: string) => {
    setOverride(snippet);
    setEditing(true);
  };

  const appendPresetToOverride = (snippet: string) => {
    setOverride((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return snippet;
      if (trimmed.includes(snippet.split("，")[0])) return trimmed;
      return `${trimmed}；${snippet}`;
    });
    setEditing(true);
  };

  const dirty = text.trim() !== initial.trim() || override.trim() !== initialOverride.trim();

  return (
    <div className="border-b px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">外貌锚点</p>
        {!editing && (
          <button
            type="button"
            className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            onClick={() => setEditing(true)}
          >
            编辑
          </button>
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        所有生图的源头：三视图、表情稿、资产、格子图都读这里。改一次，后续生成全部跟上。
      </p>

      {editing ? (
        <>
          {/* AI 协助优化 */}
          <div className="mt-3 rounded-md border border-violet-300/50 bg-violet-50/40 px-2.5 py-2 dark:border-violet-700/50 dark:bg-violet-900/10">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
                <Bot className="h-3 w-3" />
                AI 协助优化
              </p>
              <button
                type="button"
                className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => { setShowAIBox((v) => !v); setSuggestion(null); }}
              >
                {showAIBox ? "收起" : "展开"}
              </button>
            </div>
            {showAIBox && (
              <>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  AI 会消除主外貌里的矛盾词、按你期望微调、保留人设亮点。结果会显示在下方供你审阅，确认后才会替换当前内容。
                </p>
                <input
                  type="text"
                  className="mt-1.5 w-full rounded border bg-background px-2 py-1 text-xs"
                  placeholder="（可选）告诉 AI 怎么改，比如：脸更圆、年龄感更小、像古风少年"
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.target.value)}
                  disabled={rewriteMut.isPending}
                />
                <div className="mt-1.5 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={rewriteMut.isPending || !text.trim()}
                    onClick={() => rewriteMut.mutate()}
                  >
                    {rewriteMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {rewriteMut.isPending ? "生成中..." : "让 AI 优化"}
                  </Button>
                </div>
                {suggestion && (
                  <div className="mt-2 space-y-2 rounded border bg-background p-2 text-xs">
                    <p className="text-[10px] font-semibold text-muted-foreground">AI 建议（待采用）</p>
                    <div>
                      <p className="text-[10px] text-muted-foreground">修改说明</p>
                      <p className="mt-0.5 leading-relaxed">{suggestion.rationale}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">新的主外貌</p>
                      <p className="mt-0.5 whitespace-pre-wrap rounded bg-muted/50 p-1.5 leading-relaxed">{suggestion.appearance}</p>
                    </div>
                    {suggestion.faceShapeOverride && (
                      <div>
                        <p className="text-[10px] text-amber-700 dark:text-amber-300">新的脸型强覆盖</p>
                        <p className="mt-0.5 whitespace-pre-wrap rounded bg-amber-50/60 p-1.5 leading-relaxed dark:bg-amber-900/20">{suggestion.faceShapeOverride}</p>
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <Button type="button" size="sm" onClick={adoptSuggestion}>采用</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setSuggestion(null)}>丢弃</Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <p className="mt-3 mb-1 text-[10px] font-semibold text-muted-foreground">主外貌描述</p>
          <textarea
            className="w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-xs leading-relaxed"
            style={{ minHeight: 100 }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="描述角色外貌：五官、肤色、发型、年龄、体格、标志特征..."
          />

          <div className="mt-3 rounded-md border border-amber-300/50 bg-amber-50/40 px-2.5 py-2 dark:border-amber-700/50 dark:bg-amber-900/10">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">脸型强覆盖（FINAL OVERRIDE）</p>
              {override && (
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground hover:text-destructive"
                  onClick={() => setOverride("")}
                >
                  清除
                </button>
              )}
            </div>
            <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
              当主外貌里有「锐利如刀刻」「三角眼」等与你期望脸型矛盾的词时，把脸型描述填到这里——生图 prompt 会以最高优先级压制冲突词，无需删原描述。
            </p>
            <textarea
              className="mt-1.5 w-full resize-y rounded border bg-background px-2 py-1 text-xs leading-relaxed"
              style={{ minHeight: 48 }}
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              placeholder="留空 = 不启用。例如：脸型圆润饱满，下巴柔和不尖锐"
            />
            <div className="mt-1.5">
              <p className="mb-1 text-[10px] text-muted-foreground">骨相速记（点击设为覆盖；已有覆盖时追加）：</p>
              <div className="flex flex-wrap gap-1">
                {FACE_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    title={p.snippet}
                    className="rounded border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => (override.trim() ? appendPresetToOverride(p.snippet) : setPresetAsOverride(p.snippet))}
                  >
                    + {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!dirty || !text.trim() || saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              保存
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saveMut.isPending}
              onClick={() => { setText(initial); setOverride(initialOverride); setEditing(false); }}
            >
              取消
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {initial || "该角色还没有外貌锚点。"}
          </p>
          {initialOverride && (
            <div className="mt-1.5 rounded-md border border-amber-300/50 bg-amber-50/40 px-2.5 py-1.5 text-[11px] text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/10 dark:text-amber-300">
              <span className="font-semibold">脸型强覆盖：</span>{initialOverride}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CharacterDetail({
  character,
  provider,
}: {
  character: ComicCharacter;
  provider: string;
}) {
  const queryClient = useQueryClient();
  const [showSheetTuning, setShowSheetTuning] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [useCurrentImageAsReference, setUseCurrentImageAsReference] = useState(true);
  const [lockAppearance, setLockAppearance] = useState(true);
  const [appearanceOverride, setAppearanceOverride] = useState("");

  const sheetData = parseSheetData(character);
  const expressionData = getExpressionData(sheetData);
  const visualAnchorText = getVisualAnchorText(character);
  const recommendedSheetPrompt = buildRecommendedSheetPrompt(character);
  const hasSheet = sheetData.status === "done";
  const sheetFlow = useImageGenerationFlow();
  const expressionFlow = useImageGenerationFlow();

  const startSheetGeneration = (options?: GenerateCharacterSheetOptions) => {
    sheetFlow.start({
      prepare: () => prepareCharacterSheet(character.id, provider || undefined, options),
      generate: (overrides) => generateCharacterSheet(character.id, provider || undefined, options, overrides),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["comic", "project"] });
        toast.success(`${character.name} 设计稿生成完成`);
        setShowSheetTuning(false);
      },
    });
  };

  const startExpressionGeneration = () => {
    expressionFlow.start({
      prepare: () => prepareCharacterExpressionSheet(character.id, provider || undefined),
      generate: (overrides) => generateCharacterExpressionSheet(character.id, provider || undefined, overrides),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["comic", "project"] });
        toast.success(`${character.name} 表情稿生成完成`);
      },
    });
  };

  const isGenerating = sheetFlow.dialogProps.loading || sheetFlow.dialogProps.submitting || sheetData.status === "generating";
  const isExpressionGenerating = expressionFlow.dialogProps.loading || expressionFlow.dialogProps.submitting || expressionData.status === "generating";

  const openSheetTuning = () => {
    setDraftPrompt(sheetData.prompt?.trim() || recommendedSheetPrompt);
    setUseCurrentImageAsReference(true);
    setLockAppearance(true);
    setAppearanceOverride(visualAnchorText);
    setShowSheetTuning(true);
  };

  return (
    <>
      <ImageGenerationConfirmDialog {...sheetFlow.dialogProps} />
      <ImageGenerationConfirmDialog {...expressionFlow.dialogProps} />
      <section className="min-w-0 overflow-hidden rounded-lg border bg-background">
      <div className="flex flex-col gap-3 border-b px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="truncate text-lg font-semibold">{character.name}</h2>
            <GenderSelector character={character} />
          </div>
          {character.persona && (
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{character.persona}</p>
          )}
        </div>
        <CharacterStatusBadges sheetData={sheetData} expressionData={expressionData} />
      </div>

      <div className="grid min-h-[560px] lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="min-w-0 border-b lg:border-b-0 lg:border-r">
          <div className="border-b px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">三视图主设计稿</p>
                <p className="mt-0.5 text-xs text-muted-foreground">正面、侧面、背面和面部特写用于锁定角色外观。</p>
              </div>
              {hasSheet && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isGenerating || showSheetTuning}
                  onClick={openSheetTuning}
                >
                  <Wand2 className="h-4 w-4" />
                  调整三视图
                </Button>
              )}
            </div>
          </div>

          <div className="flex min-h-[360px] items-center justify-center bg-muted/30 p-4">
            {hasSheet ? (
              <img
                src={characterSheetImageUrl(character.id)}
                alt={`${character.name} 设计稿`}
                className="max-h-[520px] w-full rounded-md object-contain"
              />
            ) : isGenerating ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="text-sm">三视图生成中</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <ImageIcon className="h-10 w-10 opacity-40" />
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">还没有三视图</p>
                  <p className="mt-1 text-xs">先生成主设计稿，再继续制作表情稿和格子图参考。</p>
                </div>
                <Button type="button" size="sm" disabled={isGenerating} onClick={() => startSheetGeneration(undefined)}>
                  <Sparkles className="h-4 w-4" />
                  生成三视图
                </Button>
              </div>
            )}
          </div>

          {sheetData.status === "error" && (
            <div className="border-t bg-destructive/10 px-4 py-3 text-xs text-destructive">{sheetData.error}</div>
          )}

          <div className="border-t px-4 py-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">表情设计稿</p>
                <p className="mt-0.5 text-xs text-muted-foreground">常用表情会在分格生成时作为情绪参考。</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={expressionData.status === "done" ? "outline" : "secondary"}
                disabled={!hasSheet || isExpressionGenerating}
                onClick={startExpressionGeneration}
              >
                {isExpressionGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    生成中
                  </>
                ) : expressionData.status === "done" ? (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    更新表情稿
                  </>
                ) : (
                  <>
                    <Smile className="h-4 w-4" />
                    生成表情稿
                  </>
                )}
              </Button>
            </div>
            {expressionData.status === "done" ? (
              <div className="overflow-hidden rounded-md border bg-muted">
                <img
                  src={characterExpressionImageUrl(character.id)}
                  alt={`${character.name} 表情稿`}
                  className="max-h-56 w-full object-contain"
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
                {expressionData.status === "error"
                  ? expressionData.error ?? "表情稿生成失败"
                  : "生成三视图后，可继续生成 6 个核心表情。"}
              </div>
            )}
          </div>
        </div>

        <aside className="min-w-0">
          <VisualAnchorEditor character={character} />


          <div className="border-b px-4 py-3">
            <p className="text-sm font-medium">三视图提示词</p>
            <div className="mt-2 max-h-48 overflow-y-auto rounded-md border bg-muted/20 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              {sheetData.prompt || recommendedSheetPrompt}
            </div>
          </div>

          <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">三视图微调</p>
                <p className="mt-0.5 text-xs text-muted-foreground">编辑提示词后重新生成，成功后替换当前主设计稿。</p>
              </div>
            </div>

            {hasSheet ? (
              showSheetTuning ? (
                <div className="mt-3 space-y-3">
                  <div className="rounded-md border bg-muted/30 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-medium">可编辑提示词</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        disabled={isGenerating}
                        onClick={() => setDraftPrompt(recommendedSheetPrompt)}
                      >
                        恢复推荐提示词
                      </Button>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      常规微调只改风格、服装细节或姿态；角色脸型、发型和标志特征会随外貌锚点一起锁定。
                    </p>
                  </div>
                  <textarea
                    className="min-h-[180px] w-full resize-y rounded-md border bg-background px-3 py-2 text-xs leading-relaxed"
                    value={draftPrompt}
                    placeholder="输入本次三视图生成提示词"
                    disabled={isGenerating}
                    onChange={(event) => setDraftPrompt(event.target.value)}
                  />
                  {!sheetData.prompt && (
                    <p className="text-xs text-muted-foreground">已填入推荐提示词，可直接微调后生成。</p>
                  )}
                  <div className="space-y-2 rounded-md border bg-background px-3 py-2">
                    <label className="flex items-start gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={useCurrentImageAsReference}
                        disabled={isGenerating}
                        onChange={(event) => setUseCurrentImageAsReference(event.target.checked)}
                      />
                      <span>使用这张三视图作为参考图</span>
                    </label>
                    <label className="flex items-start gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={lockAppearance}
                        disabled={isGenerating}
                        onChange={(event) => setLockAppearance(event.target.checked)}
                      />
                      <span>锁定角色样貌</span>
                    </label>
                    {lockAppearance && (
                      <div className="space-y-1">
                        <textarea
                          className="min-h-16 w-full resize-y rounded-md border bg-muted/20 px-2 py-1.5 text-xs leading-relaxed"
                          value={appearanceOverride}
                          placeholder="补充用于锁定角色相貌的关键词，例如发型、眼睛、体型、服装和标志特征"
                          disabled={isGenerating}
                          onChange={(event) => setAppearanceOverride(event.target.value)}
                        />
                        {!appearanceOverride.trim() && (
                          <p className="text-[11px] text-muted-foreground">填写样貌关键词后，生成时会优先保持这些特征。</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={isGenerating}
                      onClick={() =>
                        startSheetGeneration({
                          prompt: draftPrompt,
                          useCurrentImageAsReference,
                          lockAppearance,
                          appearanceOverride,
                        })
                      }
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          生成中
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          生成微调图
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isGenerating}
                      onClick={() => setShowSheetTuning(false)}
                    >
                      取消
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  className="mt-3 w-full"
                  variant="outline"
                  disabled={isGenerating}
                  onClick={openSheetTuning}
                >
                  <Wand2 className="h-4 w-4" />
                  打开提示词微调
                </Button>
              )
            ) : (
              <div className="mt-3 rounded-md border border-dashed bg-muted/30 px-3 py-4 text-xs leading-relaxed text-muted-foreground">
                先生成三视图，系统会保存本次提示词，并允许基于当前图继续微调。
              </div>
            )}
          </div>
        </aside>
      </div>

      <AssetSection character={character} provider={provider} />
      </section>
    </>
  );
}

// ─── Asset Section ────────────────────────────────────────────────────────────

const ASSET_TYPE_LABELS: Record<CharacterAssetType, string> = {
  costume: "服装",
  weapon: "武器",
  item: "道具",
  vehicle: "载具",
  ability: "技能",
  other: "其他",
};

const ASSET_TYPE_ORDER: CharacterAssetType[] = ["costume", "weapon", "item", "vehicle", "ability", "other"];

const ASSET_TYPE_ACCENT: Record<CharacterAssetType, { chip: string; dot: string; soft: string }> = {
  costume: { chip: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-700/50 dark:bg-violet-900/20 dark:text-violet-300", dot: "bg-violet-500", soft: "hover:bg-violet-50 hover:border-violet-300 dark:hover:bg-violet-900/20" },
  weapon:  { chip: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-700/50 dark:bg-rose-900/20 dark:text-rose-300", dot: "bg-rose-500", soft: "hover:bg-rose-50 hover:border-rose-300 dark:hover:bg-rose-900/20" },
  item:    { chip: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-300", dot: "bg-amber-500", soft: "hover:bg-amber-50 hover:border-amber-300 dark:hover:bg-amber-900/20" },
  vehicle: { chip: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700/50 dark:bg-sky-900/20 dark:text-sky-300", dot: "bg-sky-500", soft: "hover:bg-sky-50 hover:border-sky-300 dark:hover:bg-sky-900/20" },
  ability: { chip: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-900/20 dark:text-emerald-300", dot: "bg-emerald-500", soft: "hover:bg-emerald-50 hover:border-emerald-300 dark:hover:bg-emerald-900/20" },
  other:   { chip: "border-border bg-muted text-muted-foreground", dot: "bg-muted-foreground/60", soft: "hover:bg-muted/60" },
};

const STATUS_DOT_STYLE: Record<string, string> = {
  idle: "bg-muted-foreground/30",
  generating: "bg-sky-500 animate-pulse",
  done: "bg-emerald-500",
  error: "bg-rose-500",
};

const STATUS_DOT_TITLE: Record<string, string> = {
  idle: "未生成",
  generating: "生成中",
  done: "已就绪",
  error: "生成失败",
};

function parseAssetImageData(raw: string | null): AssetImageData {
  if (!raw) return { status: "idle" };
  try { return JSON.parse(raw) as AssetImageData; } catch { return { status: "idle" }; }
}

function AssetCard({
  asset,
  provider,
  onDeleted,
  onUpdated,
}: {
  asset: ComicCharacterAsset;
  provider: string;
  onDeleted: () => void;
  onUpdated: () => void;
}) {
  const imageData = parseAssetImageData(asset.imageData);
  const flow = useImageGenerationFlow();

  const triggerGen = () => {
    flow.start({
      prepare: () => prepareCharacterAssetImage(asset.id, provider || undefined),
      generate: (overrides) => generateCharacterAssetImage(asset.id, provider || undefined, overrides),
      onSuccess: onUpdated,
    });
  };

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadCharacterAssetImage(asset.id, file),
    onSuccess: onUpdated,
    onError: (e) => toast.error(String(e)),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteCharacterAsset(asset.id),
    onSuccess: onDeleted,
    onError: (e) => toast.error(String(e)),
  });

  const accent = ASSET_TYPE_ACCENT[asset.assetType as CharacterAssetType] ?? ASSET_TYPE_ACCENT.other;
  const status = (imageData.status ?? "idle") as "idle" | "generating" | "done" | "error";

  return (
    <>
      <ImageGenerationConfirmDialog {...flow.dialogProps} />
      <GeneratedImageCard
        status={status}
        imageUrl={status === "done" ? characterAssetImageUrl(asset.id) : undefined}
        errorMessage={imageData.error}
        title={asset.name}
        subtitle={asset.description ?? undefined}
        typeBadge={{ label: ASSET_TYPE_LABELS[asset.assetType as CharacterAssetType] ?? asset.assetType, className: accent.chip }}
        onGenerate={triggerGen}
        onUpload={(file) => uploadMut.mutate(file)}
        onDelete={() => deleteMut.mutate()}
        busy={uploadMut.isPending || deleteMut.isPending}
        confirmDeleteText={`删除资产「${asset.name}」？此操作不可撤销。`}
      />
    </>
  );
}

/** 类型快捷按钮 */
function AssetTypeChip({
  type,
  active,
  onClick,
}: {
  type: CharacterAssetType;
  active: boolean;
  onClick: () => void;
}) {
  const accent = ASSET_TYPE_ACCENT[type];
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
        active
          ? `${accent.chip} ring-2 ring-offset-1 ring-offset-background ring-current/40`
          : `border-border bg-background text-muted-foreground ${accent.soft}`,
      ].join(" ")}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
      {ASSET_TYPE_LABELS[type]}
    </button>
  );
}

/** 添加输入行：激活某类型后展示，Enter 提交，Esc 取消，连续添加 */
function AssetAddRow({
  type,
  characterId,
  projectId,
  onCreated,
  onClose,
}: {
  type: CharacterAssetType;
  characterId: string;
  projectId: string;
  onCreated: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const createMut = useMutation({
    mutationFn: () =>
      createCharacterAsset({
        characterId,
        projectId,
        assetType: type,
        name: name.trim(),
        description: desc.trim() || undefined,
      }),
    onSuccess: () => {
      onCreated();
      setName("");
      setDesc("");
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    onError: (e) => toast.error(String(e)),
  });

  const accent = ASSET_TYPE_ACCENT[type];
  const placeholderName = type === "costume" ? "战斗套装" : type === "weapon" ? "月光剑" : type === "vehicle" ? "踏雪马" : type === "ability" ? "破云剑诀" : "宗门腰牌";

  return (
    <div className="mb-3 rounded-lg border-2 border-dashed border-primary/30 bg-background px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
          <p className="text-[11px] font-semibold text-foreground">
            新增{ASSET_TYPE_LABELS[type]}
          </p>
          <span className="text-[10px] text-muted-foreground">回车提交 · Esc 关闭 · 可连续添加</span>
        </div>
        <button
          type="button"
          className="text-[11px] text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          完成
        </button>
      </div>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          className="flex-1 rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
          placeholder={`${ASSET_TYPE_LABELS[type]}名称（如：${placeholderName}）`}
          value={name}
          disabled={createMut.isPending}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) createMut.mutate();
            if (e.key === "Escape") onClose();
          }}
        />
        <input
          className="flex-[1.2] rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
          placeholder="外观描述（可选，注入生图提示词）"
          value={desc}
          disabled={createMut.isPending}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) createMut.mutate();
            if (e.key === "Escape") onClose();
          }}
        />
        <button
          type="button"
          disabled={!name.trim() || createMut.isPending}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          onClick={() => createMut.mutate()}
        >
          {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "添加"}
        </button>
      </div>
    </div>
  );
}

function AssetSection({
  character,
  provider,
}: {
  character: ComicCharacter;
  provider: string;
}) {
  const queryClient = useQueryClient();
  const [activeAddType, setActiveAddType] = useState<CharacterAssetType | null>(null);

  const assetsKey = ["comic", "character-assets", character.id];

  const { data: assets = [], isLoading } = useQuery({
    queryKey: assetsKey,
    queryFn: () => listCharacterAssets(character.id),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: assetsKey });

  const grouped = ASSET_TYPE_ORDER
    .map((type) => ({ type, items: assets.filter((a) => a.assetType === type) }))
    .filter((g) => g.items.length > 0);

  const isEmpty = !isLoading && assets.length === 0;

  return (
    <div className="border-t bg-muted/10 px-4 py-4">
      {/* 标题 */}
      <div className="mb-2.5 flex items-baseline gap-2">
        <p className="text-sm font-semibold">角色资产库</p>
        <span className="text-[11px] text-muted-foreground">
          {assets.length > 0
            ? `${assets.length} 个资产 · 已按类型分组`
            : "服装、武器、道具一旦录入，生格子图会自动注入到参考图，提升一致性"}
        </span>
      </div>

      {/* 类型快捷条 = 主入口 */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground">添加：</span>
        {ASSET_TYPE_ORDER.map((t) => (
          <AssetTypeChip
            key={t}
            type={t}
            active={activeAddType === t}
            onClick={() => setActiveAddType(activeAddType === t ? null : t)}
          />
        ))}
      </div>

      {activeAddType && (
        <AssetAddRow
          key={activeAddType}
          type={activeAddType}
          characterId={character.id}
          projectId={character.projectId}
          onCreated={refresh}
          onClose={() => setActiveAddType(null)}
        />
      )}

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          加载中...
        </div>
      )}

      {isEmpty && !activeAddType && (
        <div className="rounded-lg border border-dashed bg-background/50 px-4 py-8 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Plus className="h-5 w-5" />
          </div>
          <p className="text-xs font-semibold text-foreground">还没有资产</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            点击上方任意彩色标签即可快速添加。<br />
            生格子图时会自动把对应资产合成到参考图，锁定服装 / 武器 / 道具外形。
          </p>
        </div>
      )}

      {grouped.length > 0 && (
        <div className="space-y-4">
          {grouped.map(({ type, items }) => {
            const accent = ASSET_TYPE_ACCENT[type];
            return (
              <div key={type}>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
                  <span className="text-[11px] font-semibold text-foreground">
                    {ASSET_TYPE_LABELS[type]}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{items.length}</span>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                  {items.map((asset) => (
                    <AssetCard
                      key={asset.id}
                      asset={asset}
                      provider={provider}
                      onDeleted={refresh}
                      onUpdated={refresh}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const FACT_CATEGORY_BADGE: Record<
  string,
  { label: string; className: string }
> = {
  completed: { label: "已发生", className: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-300" },
  revealed: { label: "首次登场", className: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-900/20 dark:text-violet-300" },
  state_changed: { label: "状态变化", className: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300" },
};

function FactsSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();

  const { data: facts = [], isLoading } = useQuery({
    queryKey: ["comic", "facts", projectId],
    queryFn: () => listComicFacts(projectId),
  });

  const deleteMut = useMutation({
    mutationFn: (factId: string) => deleteComicFact(factId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comic", "facts", projectId] });
    },
    onError: (e) => toast.error(String(e)),
  });

  const grouped = facts.reduce<Record<number, ComicFact[]>>((acc, fact) => {
    if (!acc[fact.episodeOrder]) acc[fact.episodeOrder] = [];
    acc[fact.episodeOrder].push(fact);
    return acc;
  }, {});
  const sortedOrders = Object.keys(grouped).map(Number).sort((a, b) => a - b);

  return (
    <div className="border-t px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <BookMarked className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium">跨话事实库</p>
        <span className="rounded border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{facts.length}</span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        生成分格脚本后系统自动提取，用于保证跨话剧情与角色状态一致性。可手动删除不准确的条目。
      </p>

      {isLoading && <div className="text-xs text-muted-foreground">加载中...</div>}

      {!isLoading && facts.length === 0 && (
        <div className="rounded-md border border-dashed bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
          尚无事实条目。生成至少一话的分格脚本后会自动提取。
        </div>
      )}

      <div className="space-y-3">
        {sortedOrders.map((order) => (
          <div key={order}>
            <div className="mb-1.5 text-[11px] font-semibold text-muted-foreground">第 {order} 话</div>
            <div className="space-y-1">
              {grouped[order].map((fact) => {
                const badge = FACT_CATEGORY_BADGE[fact.category] ?? {
                  label: fact.category,
                  className: "border-border bg-muted text-muted-foreground",
                };
                return (
                  <div
                    key={fact.id}
                    className="flex items-start gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs"
                  >
                    <span className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] leading-none ${badge.className}`}>
                      {badge.label}
                    </span>
                    <span className="flex-1 leading-relaxed text-muted-foreground">{fact.text}</span>
                    <button
                      type="button"
                      title="删除此条目"
                      disabled={deleteMut.isPending}
                      className="ml-1 mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => deleteMut.mutate(fact.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CharactersPanel({
  project,
  provider,
}: {
  project: { id: string; characters: ComicCharacter[] };
  provider: string;
}) {
  const [selectedCharacterId, setSelectedCharacterId] = useState(project.characters[0]?.id ?? "");

  if (project.characters.length === 0) {
    return (
      <div className="space-y-2 py-12 text-center text-sm text-muted-foreground">
        <Users className="mx-auto h-10 w-10 opacity-30" />
        <p>暂无角色。</p>
        <p className="text-xs">导入内容源后，角色会自动提取到这里。</p>
      </div>
    );
  }

  const selectedCharacter =
    project.characters.find((character) => character.id === selectedCharacterId) ?? project.characters[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <CharacterList
          characters={project.characters}
          selectedCharacterId={selectedCharacter.id}
          onSelect={setSelectedCharacterId}
        />
        <CharacterDetail key={selectedCharacter.id} character={selectedCharacter} provider={provider} />
      </div>
      <div className="rounded-lg border bg-background">
        <FactsSection projectId={project.id} />
      </div>
    </div>
  );
}
