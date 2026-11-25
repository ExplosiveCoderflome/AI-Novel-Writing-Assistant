import { useEffect, useRef, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";

export function InlineChapterBodyEditor({
  title,
  content,
  readingStyle,
  dirty,
  saving,
  confirmCancel,
  error,
  onTitleChange,
  onContentChange,
  onSave,
  onRequestCancel,
  onConfirmCancel,
  onContinueEditing,
}: {
  title: string;
  content: string;
  readingStyle: CSSProperties;
  dirty: boolean;
  saving: boolean;
  confirmCancel: boolean;
  error: string | null;
  onTitleChange: (next: string) => void;
  onContentChange: (next: string) => void;
  onSave: () => void;
  onRequestCancel: () => void;
  onConfirmCancel: () => void;
  onContinueEditing: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.max(element.scrollHeight, 420)}px`;
  }, [content]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div
      className="space-y-4"
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          if (dirty && !saving) onSave();
        } else if (event.key === "Escape" && !saving) {
          event.preventDefault();
          onRequestCancel();
        }
      }}
    >
      <div className="space-y-1.5">
        <label htmlFor="inline-chapter-title" className="sr-only">章节标题</label>
        <input
          id="inline-chapter-title"
          type="text"
          value={title}
          disabled={saving}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="输入章节标题"
          className="w-full border-b border-border/60 bg-transparent pb-2 text-2xl font-semibold tracking-wide text-foreground focus:border-primary focus:outline-none"
        />
      </div>

      {confirmCancel ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 bg-muted/50 px-3 py-2 text-xs">
          <span>当前修改尚未保存，确定放弃吗？</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={onContinueEditing}>继续编辑</Button>
            <Button size="sm" variant="destructive" onClick={onConfirmCancel}>放弃修改</Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="inline-chapter-body" className="sr-only">章节正文</label>
        <textarea
          ref={textareaRef}
          id="inline-chapter-body"
          value={content}
          disabled={saving}
          onChange={(event) => onContentChange(event.target.value)}
          placeholder="在这里直接书写或修改本章正文……"
          style={readingStyle}
          className="min-h-[420px] w-full resize-y rounded-md border border-border/60 bg-background/60 px-4 py-3 leading-[2.15] tracking-wide text-foreground/95 focus:border-primary/70 focus:outline-none"
        />
        <p className="text-xs text-muted-foreground">
          支持 Ctrl+S（Mac 为 Cmd+S）保存；保存后本章会自动记为“人工修订”，防止后续自动创作静默覆盖。
        </p>
      </div>
    </div>
  );
}
