import { useEffect, useMemo, useState } from "react";
import type { DocumentChapter } from "@ai-novel/shared/types/knowledge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { BookAnalysisSourceRangeDraft } from "../hooks/bookAnalysisWorkspace.types";

type RangeMode = "full" | "chapter" | "chars";

interface BookAnalysisSourceRangePickerProps {
  selectedRange: BookAnalysisSourceRangeDraft;
  sourceChapters: DocumentChapter[];
  sourceCharCount: number;
  sourceSelected: boolean;
  chaptersRequested: boolean;
  chaptersLoading: boolean;
  chaptersError?: string;
  onRangeChange: (range: BookAnalysisSourceRangeDraft) => void;
  onRequestChapters: () => void;
}

const CHAR_PRESETS = [
  { label: "前 5 万字", value: 50_000 },
  { label: "前 10 万字", value: 100_000 },
  { label: "前 20 万字", value: 200_000 },
];

const numberFormatter = new Intl.NumberFormat("zh-CN");

function formatCount(value: number): string {
  return numberFormatter.format(Math.max(0, Math.round(value)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseCharInput(input: string): number | null {
  const normalized = input.trim().toLowerCase().replace(/,/g, "");
  if (!normalized) {
    return null;
  }
  const match = normalized.match(/^(\d+(?:\.\d+)?)(k|万)?$/);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return null;
  }
  const unit = match[2];
  if (unit === "万") {
    return Math.round(value * 10_000);
  }
  if (unit === "k") {
    return Math.round(value * 1_000);
  }
  return Math.round(value);
}

function shortTitle(title: string): string {
  return title.length > 12 ? `${title.slice(0, 12)}...` : title;
}

function sortChapters(chapters: DocumentChapter[]): DocumentChapter[] {
  return [...chapters].sort((a, b) => a.chapterIndex - b.chapterIndex);
}

function findChapterByIndex(chapters: DocumentChapter[], chapterIndex: number): DocumentChapter | undefined {
  return chapters.find((chapter) => chapter.chapterIndex === chapterIndex);
}

function mapCharRangeToChapterRange(
  chapters: DocumentChapter[],
  sourceCharCount: number,
  startInput: string,
  endInput: string,
): BookAnalysisSourceRangeDraft {
  if (chapters.length <= 1 || sourceCharCount <= 0) {
    return null;
  }
  const parsedStart = parseCharInput(startInput);
  const parsedEnd = parseCharInput(endInput);
  if (parsedStart === null || parsedEnd === null) {
    return null;
  }
  const startOffset = clamp(parsedStart, 0, sourceCharCount);
  const endOffset = clamp(parsedEnd, 0, sourceCharCount);
  if (endOffset <= startOffset) {
    return null;
  }

  const first = chapters[0];
  const last = chapters[chapters.length - 1];
  const startChapter = chapters.find((chapter) => chapter.endOffset > startOffset) ?? last;
  const endChapter =
    chapters.find((chapter) => chapter.startOffset < endOffset && chapter.endOffset >= endOffset) ?? last;

  if (!first || !last || !startChapter || !endChapter) {
    return null;
  }

  return {
    startChapterIndex: Math.min(startChapter.chapterIndex, endChapter.chapterIndex),
    endChapterIndex: Math.max(startChapter.chapterIndex, endChapter.chapterIndex),
  };
}

function getInitialRange(chapters: DocumentChapter[]): BookAnalysisSourceRangeDraft {
  const first = chapters[0];
  const last = chapters[chapters.length - 1];
  if (!first || !last) {
    return null;
  }
  return {
    startChapterIndex: first.chapterIndex,
    endChapterIndex: last.chapterIndex,
  };
}

export default function BookAnalysisSourceRangePicker({
  selectedRange,
  sourceChapters,
  sourceCharCount,
  sourceSelected,
  chaptersRequested,
  chaptersLoading,
  chaptersError,
  onRangeChange,
  onRequestChapters,
}: BookAnalysisSourceRangePickerProps) {
  const [mode, setMode] = useState<RangeMode>(selectedRange ? "chapter" : "full");
  const sortedChapters = useMemo(() => sortChapters(sourceChapters), [sourceChapters]);
  const canUseChapterRange = sortedChapters.length > 1;
  const selectedStartChapter = selectedRange
    ? findChapterByIndex(sortedChapters, selectedRange.startChapterIndex)
    : undefined;
  const selectedEndChapter = selectedRange
    ? findChapterByIndex(sortedChapters, selectedRange.endChapterIndex)
    : undefined;
  const [charStartInput, setCharStartInput] = useState("0");
  const [charEndInput, setCharEndInput] = useState(() => String(sourceCharCount || ""));

  const selectedStartOffset = selectedStartChapter?.startOffset ?? 0;
  const selectedEndOffset = selectedEndChapter?.endOffset ?? sourceCharCount;
  const selectedCharCount = Math.max(0, selectedEndOffset - selectedStartOffset);
  const selectedStartPosition = selectedStartChapter
    ? sortedChapters.findIndex((chapter) => chapter.chapterIndex === selectedStartChapter.chapterIndex)
    : 0;
  const selectedEndPosition = selectedEndChapter
    ? sortedChapters.findIndex((chapter) => chapter.chapterIndex === selectedEndChapter.chapterIndex)
    : Math.max(0, sortedChapters.length - 1);
  const selectedChapterCount = selectedRange && selectedStartPosition >= 0 && selectedEndPosition >= selectedStartPosition
    ? selectedEndPosition - selectedStartPosition + 1
    : sortedChapters.length;
  const percent = sourceCharCount > 0 ? clamp((selectedCharCount / sourceCharCount) * 100, 0, 100) : 0;
  const barLeft = sourceCharCount > 0 ? clamp((selectedStartOffset / sourceCharCount) * 100, 0, 100) : 0;
  const barWidth = sourceCharCount > 0 ? clamp((selectedCharCount / sourceCharCount) * 100, 0, 100 - barLeft) : 0;

  useEffect(() => {
    if (!selectedRange && mode !== "full") {
      return;
    }
    setMode(selectedRange ? mode === "chars" ? "chars" : "chapter" : "full");
  }, [selectedRange]);

  useEffect(() => {
    if (mode !== "chars" || !selectedStartChapter || !selectedEndChapter) {
      return;
    }
    setCharStartInput(String(selectedStartChapter.startOffset));
    setCharEndInput(String(selectedEndChapter.endOffset));
  }, [mode, selectedStartChapter, selectedEndChapter]);

  useEffect(() => {
    if (mode === "full" || selectedRange || !canUseChapterRange) {
      return;
    }
    onRangeChange(getInitialRange(sortedChapters));
  }, [canUseChapterRange, mode, onRangeChange, selectedRange, sortedChapters]);

  const selectMode = (nextMode: RangeMode) => {
    setMode(nextMode);
    if (nextMode === "full") {
      onRangeChange(null);
      return;
    }
    onRequestChapters();
    if (canUseChapterRange && !selectedRange) {
      onRangeChange(getInitialRange(sortedChapters));
    }
  };

  const applyChapterRange = (startChapterIndex: number, endChapterIndex: number) => {
    onRangeChange({
      startChapterIndex: Math.min(startChapterIndex, endChapterIndex),
      endChapterIndex: Math.max(startChapterIndex, endChapterIndex),
    });
  };

  const applyCharRange = (nextStartInput: string, nextEndInput: string) => {
    const nextRange = mapCharRangeToChapterRange(sortedChapters, sourceCharCount, nextStartInput, nextEndInput);
    if (nextRange) {
      onRangeChange(nextRange);
    }
  };

  const applyChapterPreset = (preset: "first5" | "last5" | "frontThird" | "middleThird" | "backThird") => {
    if (!canUseChapterRange) {
      return;
    }
    const total = sortedChapters.length;
    let startPosition = 0;
    let endPosition = total - 1;
    if (preset === "first5") {
      endPosition = Math.min(total - 1, 4);
    } else if (preset === "last5") {
      startPosition = Math.max(0, total - 5);
    } else if (preset === "frontThird") {
      endPosition = Math.max(0, Math.ceil(total / 3) - 1);
    } else if (preset === "middleThird") {
      startPosition = Math.floor(total / 3);
      endPosition = Math.max(startPosition, Math.ceil((total * 2) / 3) - 1);
    } else if (preset === "backThird") {
      startPosition = Math.floor((total * 2) / 3);
    }
    const start = sortedChapters[startPosition];
    const end = sortedChapters[endPosition];
    if (start && end) {
      applyChapterRange(start.chapterIndex, end.chapterIndex);
    }
  };

  const applyCharPreset = (charCount: number) => {
    const nextStart = "0";
    const nextEnd = String(Math.min(charCount, sourceCharCount || charCount));
    setCharStartInput(nextStart);
    setCharEndInput(nextEnd);
    applyCharRange(nextStart, nextEnd);
  };

  const rangeTitle = selectedRange && selectedStartChapter && selectedEndChapter
    ? `第 ${selectedStartChapter.chapterIndex + 1} 章 ~ 第 ${selectedEndChapter.chapterIndex + 1} 章`
    : "全文";
  const rangeDetail = selectedRange && selectedStartChapter && selectedEndChapter
    ? `${selectedChapterCount} 章 · 约 ${formatCount(selectedCharCount)} 字 · 占全文 ${Math.round(percent)}%`
    : `${sortedChapters.length > 0 ? `${sortedChapters.length} 章 · ` : ""}约 ${formatCount(sourceCharCount)} 字`;
  const charModeHint = selectedRange && selectedStartChapter && selectedEndChapter
    ? `按章节边界覆盖第 ${selectedStartChapter.chapterIndex + 1} 章 ~ 第 ${selectedEndChapter.chapterIndex + 1} 章`
    : "输入字数后会自动换算为章节范围";

  return (
    <div className="space-y-2 rounded-md border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">原文范围</div>
        <div className="inline-flex rounded-md bg-muted/40 p-1">
          {([
            ["full", "全文"],
            ["chapter", "按章节"],
            ["chars", "按字数"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={cn(
                "h-7 rounded px-3 text-xs transition-colors",
                mode === key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                key !== "full" && !sourceSelected ? "cursor-not-allowed opacity-50" : "",
              )}
              disabled={key !== "full" && !sourceSelected}
              onClick={() => selectMode(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === "chapter" ? (
        <div className="grid gap-2 lg:grid-cols-[1fr_1fr]">
          {canUseChapterRange ? (
            <>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-xs"
                value={selectedRange?.startChapterIndex ?? sortedChapters[0]?.chapterIndex ?? 0}
                onChange={(event) => {
                  const startChapterIndex = Number(event.target.value);
                  const fallbackEnd = selectedRange?.endChapterIndex ?? sortedChapters[sortedChapters.length - 1]?.chapterIndex ?? startChapterIndex;
                  applyChapterRange(startChapterIndex, Math.max(startChapterIndex, fallbackEnd));
                }}
              >
                {sortedChapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.chapterIndex}>
                    起：第 {chapter.chapterIndex + 1} 章 · {shortTitle(chapter.title)}
                  </option>
                ))}
              </select>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-xs"
                value={selectedRange?.endChapterIndex ?? sortedChapters[sortedChapters.length - 1]?.chapterIndex ?? 0}
                onChange={(event) => {
                  const endChapterIndex = Number(event.target.value);
                  const fallbackStart = selectedRange?.startChapterIndex ?? sortedChapters[0]?.chapterIndex ?? endChapterIndex;
                  applyChapterRange(fallbackStart, endChapterIndex);
                }}
              >
                {sortedChapters
                  .filter((chapter) => chapter.chapterIndex >= (selectedRange?.startChapterIndex ?? sortedChapters[0]?.chapterIndex ?? 0))
                  .map((chapter) => (
                    <option key={chapter.id} value={chapter.chapterIndex}>
                      止：第 {chapter.chapterIndex + 1} 章 · {shortTitle(chapter.title)}
                    </option>
                  ))}
              </select>
            </>
          ) : (
            <RangeLoadHint
              requested={chaptersRequested}
              loading={chaptersLoading}
              error={chaptersError}
              sourceSelected={sourceSelected}
            />
          )}
        </div>
      ) : null}

      {mode === "chars" ? (
        <div className="space-y-2">
          <div className="grid gap-2 lg:grid-cols-[1fr_1fr]">
            <Input
              className="h-9 text-xs"
              value={charStartInput}
              disabled={!canUseChapterRange}
              onChange={(event) => setCharStartInput(event.target.value)}
              onBlur={() => applyCharRange(charStartInput, charEndInput)}
              placeholder="起始字数，如 5000"
            />
            <Input
              className="h-9 text-xs"
              value={charEndInput}
              disabled={!canUseChapterRange}
              onChange={(event) => setCharEndInput(event.target.value)}
              onBlur={() => applyCharRange(charStartInput, charEndInput)}
              placeholder="结束字数，如 5万"
            />
          </div>
          <div className="text-xs text-muted-foreground">{charModeHint}</div>
          {!canUseChapterRange ? (
            <RangeLoadHint
              requested={chaptersRequested}
              loading={chaptersLoading}
              error={chaptersError}
              sourceSelected={sourceSelected}
            />
          ) : null}
        </div>
      ) : null}

      {mode === "chapter" && canUseChapterRange ? (
        <div className="flex flex-wrap gap-1.5">
          <QuickButton onClick={() => applyChapterPreset("first5")}>前 5 章</QuickButton>
          <QuickButton onClick={() => applyChapterPreset("last5")}>后 5 章</QuickButton>
          <QuickButton onClick={() => applyChapterPreset("frontThird")}>前 1/3</QuickButton>
          <QuickButton onClick={() => applyChapterPreset("middleThird")}>中 1/3</QuickButton>
          <QuickButton onClick={() => applyChapterPreset("backThird")}>后 1/3</QuickButton>
        </div>
      ) : null}

      {mode === "chars" && canUseChapterRange ? (
        <div className="flex flex-wrap gap-1.5">
          {CHAR_PRESETS.map((preset) => (
            <QuickButton key={preset.value} onClick={() => applyCharPreset(preset.value)}>
              {preset.label}
            </QuickButton>
          ))}
        </div>
      ) : null}

      <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-medium text-foreground">{rangeTitle}</span>
          <span className="font-mono tabular-nums text-muted-foreground">{rangeDetail}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{
              marginLeft: `${selectedRange ? barLeft : 0}%`,
              width: `${selectedRange ? barWidth : 100}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function QuickButton({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onClick}>
      {children}
    </Button>
  );
}

function RangeLoadHint({
  requested,
  loading,
  error,
  sourceSelected,
}: {
  requested: boolean;
  loading: boolean;
  error?: string;
  sourceSelected: boolean;
}) {
  let message = "选择文档后可按章节或字数限制本次分析输入。";
  if (sourceSelected && loading) {
    message = "正在加载章节范围...";
  } else if (sourceSelected && error) {
    message = "章节范围加载失败，可先按全文创建拆书。";
  } else if (sourceSelected && requested) {
    message = "当前文档章节不足，可按全文创建拆书。";
  } else if (sourceSelected) {
    message = "切换到范围模式后会加载章节范围。";
  }
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
      {message}
    </div>
  );
}
