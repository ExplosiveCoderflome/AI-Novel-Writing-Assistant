import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
      <FilterGroup label={i18next.t("dict.gen_3fea7ca7")}>
        <SegmentButton active={props.status === "all"} onClick={() => props.onStatusChange("all")}>{i18next.t("autoDirector.secAll")}</SegmentButton>
        <SegmentButton active={props.status === "draft"} onClick={() => props.onStatusChange("draft")}>{i18next.t("common.draft")}</SegmentButton>
        <SegmentButton active={props.status === "published"} onClick={() => props.onStatusChange("published")}>{i18next.t("common.published")}</SegmentButton>
      </FilterGroup>
      <FilterGroup label={i18next.t("dict.gen_226b0912")}>
        <SegmentButton active={props.writingMode === "all"} onClick={() => props.onWritingModeChange("all")}>{i18next.t("autoDirector.secAll")}</SegmentButton>
        <SegmentButton active={props.writingMode === "original"} onClick={() => props.onWritingModeChange("original")}>{i18next.t("common.original")}</SegmentButton>
        <SegmentButton active={props.writingMode === "continuation"} onClick={() => props.onWritingModeChange("continuation")}>{i18next.t("common.continuation")}</SegmentButton>
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
