import { Button } from "@/components/ui/button";
import type { StatusFilter, WritingModeFilter } from "./novelListViewModel";

export function NovelListFilterBar(props: {
  status: StatusFilter;
  writingMode: WritingModeFilter;
  onStatusChange: (status: StatusFilter) => void;
  onWritingModeChange: (mode: WritingModeFilter) => void;
}) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-4">
      <FilterGroup label="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.">
        <SegmentButton active={props.status === "all"} onClick={() => props.onStatusChange("all")}>Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</SegmentButton>
        <SegmentButton active={props.status === "draft"} onClick={() => props.onStatusChange("draft")}>draft</SegmentButton>
        <SegmentButton active={props.status === "published"} onClick={() => props.onStatusChange("published")}>Published</SegmentButton>
      </FilterGroup>
      <FilterGroup label="type">
        <SegmentButton active={props.writingMode === "all"} onClick={() => props.onWritingModeChange("all")}>Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</SegmentButton>
        <SegmentButton active={props.writingMode === "original"} onClick={() => props.onWritingModeChange("original")}>Original</SegmentButton>
        <SegmentButton active={props.writingMode === "continuation"} onClick={() => props.onWritingModeChange("continuation")}>Continue writing</SegmentButton>
      </FilterGroup>
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
  children: string;
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
