import i18next from "i18next";
import type { TitleSuggestionStyle } from "@ai-novel/shared/types/title";

export function getTitleStyleLabel(style: TitleSuggestionStyle): string {
  switch (style) {
    case "literary":
      return i18next.t("titles.titleStudio.shared.co0p9");
    case "conflict":
      return i18next.t("titles.titleStudio.shared.atlul2");
    case "suspense":
      return i18next.t("titles.titleStudio.shared.emlpy");
    case "high_concept":
      return i18next.t("titles.titleStudio.shared.n6ykr");
    default:
      return i18next.t("titles.titleStudio.shared.drasjk");
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
