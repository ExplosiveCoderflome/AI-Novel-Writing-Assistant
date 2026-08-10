import type { HomeTone } from "../homeViewModel";

export function toneBorderClass(tone: HomeTone): string {
  if (tone === "danger") {
    return "border-destructive/35";
  }
  if (tone === "warning") {
    return "border-amber-300/70";
  }
  if (tone === "success") {
    return "border-emerald-300/70";
  }
  if (tone === "info") {
    return "border-sky-300/70";
  }
  return "border-border";
}

export function toneSurfaceClass(tone: HomeTone): string {
  if (tone === "danger") {
    return "bg-destructive/10";
  }
  if (tone === "warning") {
    return "bg-amber-50";
  }
  if (tone === "success") {
    return "bg-emerald-50";
  }
  if (tone === "info") {
    return "bg-sky-50";
  }
  return "bg-card";
}

export function toneTextClass(tone: HomeTone): string {
  if (tone === "danger") {
    return "text-destructive";
  }
  if (tone === "warning") {
    return "text-amber-700";
  }
  if (tone === "success") {
    return "text-emerald-700";
  }
  if (tone === "info") {
    return "text-sky-700";
  }
  return "text-muted-foreground";
}
