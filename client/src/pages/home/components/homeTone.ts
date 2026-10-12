import type { HomeTone } from "../homeViewModel";

export function toneBorderClass(tone: HomeTone): string {
  if (tone === "danger") {
    return "border-destructive/35";
  }
  if (tone === "warning") {
    return "border-warning/45";
  }
  if (tone === "success") {
    return "border-success/45";
  }
  if (tone === "info") {
    return "border-info/45";
  }
  return "border-border";
}

export function toneSurfaceClass(tone: HomeTone): string {
  if (tone === "danger") {
    return "bg-destructive/10";
  }
  if (tone === "warning") {
    return "bg-warning/10";
  }
  if (tone === "success") {
    return "bg-success/10";
  }
  if (tone === "info") {
    return "bg-info/10";
  }
  return "bg-card";
}

export function toneTextClass(tone: HomeTone): string {
  if (tone === "danger") {
    return "text-destructive";
  }
  if (tone === "warning") {
    return "text-warning";
  }
  if (tone === "success") {
    return "text-success";
  }
  if (tone === "info") {
    return "text-info";
  }
  return "text-muted-foreground";
}
