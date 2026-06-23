import { useRef, type ReactNode } from "react";
import { Image as ImageIcon, Loader2, Sparkles, Trash2, Upload } from "lucide-react";

export type GeneratedImageCardStatus = "idle" | "generating" | "done" | "error";

const STATUS_DOT: Record<GeneratedImageCardStatus, string> = {
  idle: "bg-muted-foreground/30",
  generating: "bg-sky-500 animate-pulse",
  done: "bg-emerald-500",
  error: "bg-rose-500",
};

const STATUS_TITLE: Record<GeneratedImageCardStatus, string> = {
  idle: "未生成",
  generating: "生成中",
  done: "已就绪",
  error: "生成失败",
};

const SIZE_STYLE: Record<NonNullable<GeneratedImageCardProps["size"]>, string> = {
  compact: "h-24",
  regular: "h-36",
  large: "h-48",
};

const ASPECT_STYLE: Record<NonNullable<GeneratedImageCardProps["aspectRatio"]>, string> = {
  square: "aspect-square",
  portrait: "aspect-[3/4]",
  landscape: "aspect-[4/3]",
};

export interface GeneratedImageCardProps {
  /** 当前生成状态（驱动占位/loading/error 显示） */
  status: GeneratedImageCardStatus;
  /** 已就绪时的图片 URL */
  imageUrl?: string;
  /** error 时的可选错误文字（用于 hover 提示） */
  errorMessage?: string;

  /** 卡片主标题 */
  title: string;
  /** 卡片副标题 / 描述（line-clamp-2） */
  subtitle?: string;
  /** 类型徽章 { label, className(tailwind 类) } */
  typeBadge?: { label: string; className: string };

  /** 主操作：AI 生图（或重新生成）。不传则不显示。 */
  onGenerate?: () => void;
  /** 次操作：上传图片。不传则不显示。 */
  onUpload?: (file: File) => void;
  /** 删除操作：hover 时显示。不传则不显示。 */
  onDelete?: () => void;
  /** 外部 busy 状态（mutation pending）+ generating 状态会一起禁用操作 */
  busy?: boolean;

  /** 图片区高度 */
  size?: "compact" | "regular" | "large";
  /** 图片区比例（与 size 冲突时优先 aspectRatio） */
  aspectRatio?: "square" | "portrait" | "landscape";

  /** 自定义空态内容 */
  emptyHint?: ReactNode;
  /** 卡片底部自定义内容（如额外操作按钮、提示） */
  footer?: ReactNode;

  /** 主按钮文案；默认 idle="AI 生图" / done="重新生成" */
  generateLabel?: string;
  /** 删除前确认文案；不传则不弹确认 */
  confirmDeleteText?: string;
}

/**
 * 通用生图卡片
 *
 * 设计目标：覆盖角色资产、场景设定图、表情稿等"业务表 JSON 状态机生图"场景的展示与基础操作。
 * 不覆盖：三视图主设计稿（有特殊微调流程）、格子图（有重抽/导出/弹窗等复杂交互）—— 这些保留独立实现。
 */
export function GeneratedImageCard({
  status,
  imageUrl,
  errorMessage,
  title,
  subtitle,
  typeBadge,
  onGenerate,
  onUpload,
  onDelete,
  busy = false,
  size = "regular",
  aspectRatio,
  emptyHint,
  footer,
  generateLabel,
  confirmDeleteText,
}: GeneratedImageCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isGenerating = busy || status === "generating";
  const hasDoneImage = status === "done" && Boolean(imageUrl);

  const imageWrapperClass = aspectRatio ? ASPECT_STYLE[aspectRatio] : SIZE_STYLE[size];

  return (
    <div className="group relative overflow-hidden rounded-lg border bg-background shadow-sm transition-shadow hover:shadow-md">
      {/* 状态点 */}
      <span
        title={STATUS_TITLE[status]}
        className={`absolute top-1.5 right-1.5 z-10 h-2 w-2 rounded-full ring-2 ring-background ${STATUS_DOT[status]}`}
      />

      {/* 删除按钮：hover 才显示 */}
      {onDelete && (
        <button
          type="button"
          title="删除"
          disabled={busy}
          className="absolute top-1.5 left-1.5 z-10 rounded-md bg-background/85 p-1 text-muted-foreground/70 opacity-0 backdrop-blur-sm transition-opacity hover:bg-destructive hover:text-white group-hover:opacity-100 disabled:opacity-50"
          onClick={() => {
            if (!confirmDeleteText || window.confirm(confirmDeleteText)) onDelete();
          }}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}

      {/* 图片区 */}
      <div className={`relative flex items-center justify-center bg-gradient-to-br from-muted/30 to-muted/60 ${imageWrapperClass}`}>
        {hasDoneImage ? (
          <img
            src={imageUrl}
            alt={title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : isGenerating ? (
          <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-[10px]">生成中</span>
          </div>
        ) : status === "error" ? (
          <div className="flex flex-col items-center gap-1 px-2 text-center text-rose-600 dark:text-rose-400" title={errorMessage}>
            <ImageIcon className="h-6 w-6 opacity-50" />
            <span className="text-[10px]">生成失败，可重试</span>
          </div>
        ) : emptyHint ? (
          <>{emptyHint}</>
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground/50">
            <ImageIcon className="h-7 w-7" />
            <span className="text-[10px]">待生成</span>
          </div>
        )}
      </div>

      {/* 信息区 */}
      <div className="space-y-1.5 px-2.5 pb-2 pt-2">
        <div className="flex items-center gap-1.5">
          {typeBadge && (
            <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-medium leading-none ${typeBadge.className}`}>
              {typeBadge.label}
            </span>
          )}
          <p className="min-w-0 flex-1 truncate text-xs font-semibold">{title}</p>
        </div>
        {subtitle && (
          <p className="line-clamp-2 text-[10px] leading-relaxed text-muted-foreground" title={subtitle}>
            {subtitle}
          </p>
        )}

        {/* 操作 */}
        {(onGenerate || onUpload) && (
          <div className="flex items-center gap-1.5 pt-0.5">
            {onGenerate && (
              <button
                type="button"
                disabled={isGenerating}
                className="flex flex-1 items-center justify-center gap-1 rounded-md bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                onClick={onGenerate}
              >
                {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {generateLabel ?? (hasDoneImage ? "重新生成" : "AI 生图")}
              </button>
            )}
            {onUpload && (
              <button
                type="button"
                title="上传图片替代 AI 生成"
                disabled={isGenerating}
                className="rounded-md border px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {footer}

        {onUpload && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
        )}
      </div>
    </div>
  );
}
