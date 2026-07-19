/**
 * 图像生成 runtime 统一类型 + Adapter 接口
 *
 * 设计意图：comic 5 个 + drama 2 个生图入口（共 7 处）历史上各写一套
 * "业务表 JSON 字段 + idle→generating→done/error 状态机 + 落盘 + 清旧扩展名"样板。
 * 本模块把样板提到 runner 里执行一次，由 Adapter 适配各入口的状态字段。
 *
 * 持久化模型不动：状态仍嵌业务表 JSON 字段（sheetData/imageData/portraitData/keyframeData）。
 * 不替代 ImageGenerationService（小说封面 + 老 character image 走两表模型，范式不同）。
 */
import type { ImageSize } from "../types";
import type { LLMProvider } from "@ai-novel/shared/types/llm";

// ─── 状态 ─────────────────────────────────────────────────────────────────────

export type GeneratedImageStatus = "idle" | "generating" | "done" | "error";

export interface GeneratedImageHistoryItem {
  version: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
}

/** 生成的参考素材元数据（成功生图后写入，供前端弹窗溯源） */
export interface GeneratedReferenceImageMeta {
  /** character_sheet=三视图 | character_expression=表情稿 | character_face=面部裁剪 | asset=角色资产 | scene=场景设定图 */
  kind: "character_sheet" | "character_expression" | "character_face" | "asset" | "scene";
  /** 人类可读标签 */
  label: string;
  /** HTTP URL */
  url: string;
}

/** 所有生图入口的统一状态形状 */
export interface GeneratedImageState {
  status: GeneratedImageStatus;
  version?: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  origin?: "generated" | "uploaded";
  history?: GeneratedImageHistoryItem[];
  /** 本次生图实际使用的参考素材（成功时才写） */
  referenceImages?: GeneratedReferenceImageMeta[];
}

// ─── Adapter 接口 ────────────────────────────────────────────────────────────

/**
 * 适配业务表的状态字段读写。每个生图入口（角色三视图/表情稿/资产/场景/格子图/Drama 角色/Drama 关键帧）
 * 实现一个 Adapter，把"如何从业务表读出当前状态、如何把新状态写回去、如何计算磁盘路径与 HTTP URL"封装在内。
 *
 * `TState` 允许扩展自 GeneratedImageState 以保留入口特定字段（如表情稿的嵌套位置、Drama 的 portraitData 兼容字段）。
 */
export interface ImageTargetAdapter<TState extends GeneratedImageState = GeneratedImageState> {
  /** 标识，用于日志/trace（如 "comic.character.sheet" / "drama.shot.keyframe"） */
  readonly kind: string;
  /** 读当前状态（不存在返回 { status: "idle" }） */
  loadState(): Promise<TState>;
  /** 写状态（generating / done / error 均走此） */
  saveState(state: TState): Promise<void>;
  /** 计算落盘绝对路径（已知扩展名） */
  diskPath(ext: string): string;
  /** 返回 HTTP 可访问的 URL（写入 state.url） */
  publicUrl(): string;
  /** 删除同目录其他扩展名的旧文件（用于覆盖式生成）；可选 */
  cleanupOtherExts?(keepExt: string): Promise<void>;
  /** 版本管理策略：归档历史 + 版本号递增；不填则保留 history 但不归档现图 */
  versioning?: {
    enabled: boolean;
    /** history 最多保留几条；默认 5 */
    maxHistory?: number;
    /** 归档时把当前 done 状态转成历史条目；默认拷贝 url/prompt/provider/generatedAt/version */
    archiveCurrent?: (current: TState) => Promise<GeneratedImageHistoryItem | null>;
  };
  /** 合并业务定制状态字段（如把生成结果同时回写到兼容字段）；可选 */
  buildExtraDoneState?(base: GeneratedImageState): Partial<TState>;
}

// ─── runImageGeneration 入参 ──────────────────────────────────────────────────

export interface RunImageGenerationOptions {
  /** LLM provider（缺省走调用方默认） */
  provider?: LLMProvider | string;
  /** 已构建好的 prompt */
  prompt: string;
  negativePrompt?: string;
  /** 图片尺寸（默认 1024x1536，竖版漫画/角色） */
  size?: ImageSize;
  /** 生成张数（默认 1） */
  count?: number;
  /** 参考图本地路径（优先级高于 refImages） */
  refImagePaths?: string[];
  /** 参考图 URL */
  refImages?: string[];
  /** 写入 imageData.referenceImages 的素材元数据（供前端溯源） */
  referenceImages?: GeneratedReferenceImageMeta[];
  /** sceneType 透传给底层 provider（不同 provider 有不同默认） */
  sceneType?: "character" | "novel_cover" | "chapter_illustration";
}

export const DEFAULT_RUNTIME_PROVIDER: LLMProvider = "sensenova";
export const DEFAULT_RUNTIME_SIZE: ImageSize = "1024x1536";

// ─── 生图前预览数据（确认弹窗用） ────────────────────────────────────────────

/**
 * service.prepare() 返回给前端的"将要发送给图像模型的全部素材"快照。
 * 前端弹窗展示这份数据，用户确认（可临时改 prompt/provider/size）后再调 generate。
 */
export interface ImageGenerationPreview {
  /** 入口 kind，如 "comic.character-asset" / "comic.scene" / "comic.panel" / "drama.character" 等 */
  kind: string;
  /** 入口标题（前端展示，如 "生成场景设定图：宗门大殿"） */
  title: string;
  /** 即将发送的 prompt（完整文本，可前端编辑后通过 override 回传） */
  prompt: string;
  negativePrompt?: string;
  /** 参考素材清单（前端缩略图展示，URL 可直接 img src） */
  referenceImages: GeneratedReferenceImageMeta[];
  /** 默认 provider；用户可在弹窗里改 */
  provider: string;
  /** 默认 size；用户可在弹窗里改 */
  size: ImageSize;
  /** 可选 provider 列表（前端下拉用，由调用方传入） */
  availableProviders?: Array<{ value: string; label: string }>;
  /** 可选 size 列表（前端下拉用） */
  availableSizes?: ImageSize[];
}

/**
 * 前端确认时回传的覆盖参数。
 * 全部可选——未传则按 service 的默认值。
 */
export interface ImageGenerationOverrides {
  promptOverride?: string;
  providerOverride?: string;
  sizeOverride?: ImageSize;
  negativePromptOverride?: string;
  /** 用户在确认弹窗中临时移除的参考素材 URL；本次生成不发送这些参考图 */
  excludedReferenceImageUrls?: string[];
}
