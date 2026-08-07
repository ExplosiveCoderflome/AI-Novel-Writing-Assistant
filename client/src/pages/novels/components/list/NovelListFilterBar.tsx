import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { StatusFilter, WritingModeFilter } from "./novelListViewModel";

export function NovelListFilterBar(props: {
  status: StatusFilter;
  writingMode: WritingModeFilter;
  onStatusChange: (status: StatusFilter) => void;
  onWritingModeChange: (mode: WritingModeFilter) => void;
  view?: "shelf" | "workbench";
  search?: string;
  onSearchChange?: (value: string) => void;
  narrativeForm?: "all" | "short_story" | "long_novel";
  onNarrativeFormChange?: (value: "all" | "short_story" | "long_novel") => void;
  sort?: "updated" | "created" | "progress";
  onSortChange?: (value: "updated" | "created" | "progress") => void;
}) {
  const isShelf = props.view === "shelf";
  if (isShelf) {
    return (
      <section className="flex flex-wrap items-center gap-3 border-b border-border/60 pb-4">
        {props.onSearchChange ? (
          <label className="relative min-w-[220px] flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={props.search ?? ""} onChange={(event) => props.onSearchChange?.(event.target.value)} placeholder="搜索作品标题或简介" className="h-10 pl-9" />
          </label>
        ) : null}
        {props.onNarrativeFormChange ? (
          <Select value={props.narrativeForm ?? "all"} onValueChange={(value) => props.onNarrativeFormChange?.(value as "all" | "short_story" | "long_novel")}>
            <SelectTrigger className="h-10 w-[120px] rounded-lg shadow-none"><SelectValue placeholder="作品形式" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部形式</SelectItem>
              <SelectItem value="long_novel">长篇</SelectItem>
              <SelectItem value="short_story">短篇</SelectItem>
            </SelectContent>
          </Select>
        ) : null}
        {props.onSortChange ? (
          <Select value={props.sort ?? "updated"} onValueChange={(value) => props.onSortChange?.(value as "updated" | "created" | "progress")}>
            <SelectTrigger className="h-10 w-[132px] rounded-lg shadow-none"><SelectValue placeholder="排序" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">最近编辑</SelectItem>
              <SelectItem value="created">最近创建</SelectItem>
              <SelectItem value="progress">完成度</SelectItem>
            </SelectContent>
          </Select>
        ) : null}
      </section>
    );
  }
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
      {isShelf && props.onSearchChange ? (
        <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={props.search ?? ""} onChange={(event) => props.onSearchChange?.(event.target.value)} placeholder="搜索作品标题或简介" className="pl-9" />
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
      <FilterGroup label="状态">
        <SegmentButton active={props.status === "all"} onClick={() => props.onStatusChange("all")}>全部</SegmentButton>
        <SegmentButton active={props.status === "draft"} onClick={() => props.onStatusChange("draft")}>草稿</SegmentButton>
        <SegmentButton active={props.status === "published"} onClick={() => props.onStatusChange("published")}>已发布</SegmentButton>
      </FilterGroup>
      <FilterGroup label="类型">
        <SegmentButton active={props.writingMode === "all"} onClick={() => props.onWritingModeChange("all")}>全部</SegmentButton>
        <SegmentButton active={props.writingMode === "original"} onClick={() => props.onWritingModeChange("original")}>原创</SegmentButton>
        <SegmentButton active={props.writingMode === "continuation"} onClick={() => props.onWritingModeChange("continuation")}>续写</SegmentButton>
      </FilterGroup>
      {isShelf && props.onNarrativeFormChange ? (
        <FilterGroup label="形式">
          <SegmentButton active={props.narrativeForm === "all"} onClick={() => props.onNarrativeFormChange?.("all")}>全部</SegmentButton>
          <SegmentButton active={props.narrativeForm === "long_novel"} onClick={() => props.onNarrativeFormChange?.("long_novel")}>长篇</SegmentButton>
          <SegmentButton active={props.narrativeForm === "short_story"} onClick={() => props.onNarrativeFormChange?.("short_story")}>短篇</SegmentButton>
        </FilterGroup>
      ) : null}
      {isShelf && props.onSortChange ? (
        <FilterGroup label="排序">
          <SegmentButton active={props.sort === "updated"} onClick={() => props.onSortChange?.("updated")}><SlidersHorizontal className="mr-1 h-3.5 w-3.5" aria-hidden="true" />最近编辑</SegmentButton>
          <SegmentButton active={props.sort === "created"} onClick={() => props.onSortChange?.("created")}>最近创建</SegmentButton>
          <SegmentButton active={props.sort === "progress"} onClick={() => props.onSortChange?.("progress")}>完成度</SegmentButton>
        </FilterGroup>
      ) : null}
      </div>
    </section>
  );
}

function FilterGroup(props: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">{props.label}</span>
      <div className="inline-flex rounded-lg bg-muted/35 p-1">{props.children}</div>
    </div>
  );
}

function SegmentButton(props: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={props.active ? "default" : "ghost"}
      className="h-8 rounded-md px-3"
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  );
}
