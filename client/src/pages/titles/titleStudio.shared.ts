import type { TitleSuggestionStyle } from "@ai-novel/shared/types/title";

export function getTitleStyleLabel(style: TitleSuggestionStyle): string {
  switch (style) {
    case "literary":
      return "sense of narrative";
    case "conflict":
      return "conflict hook";
    case "suspense":
      return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
    case "high_concept":
      return "high concept";
    default:
      return "title strategy";
  }
}

export function getClickRateBadgeClass(rate: number): string {
  if (rate >= 90) {
    return "bg-rose-500 text-white";
  }
  if (rate >= 80) {
    return "bg-orange-500 text-white";
  }
  if (rate >= 70) {
    return "bg-amber-500 text-black";
  }
  return "bg-muted text-muted-foreground";
}

export function truncateText(value: string | null | undefined, maxLength = 120): string {
  const text = (value ?? "").trim();
  if (!text) {
    return "";
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}
