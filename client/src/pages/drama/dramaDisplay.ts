import i18next from "i18next";
import type { DramaSourceType } from "@/api/drama";

export const DRAMA_TRACK_OPTIONS = [
  { value: "counterattack", label: i18next.t("gen.pages.drama.dramaDisplay.gen_68c87432") },
  { value: "rebirth_revenge", label: i18next.t("gen.pages.drama.dramaDisplay.gen_1a20c3ee") },
  { value: "war_god", label: i18next.t("gen.pages.drama.dramaDisplay.gen_88650ef5") },
  { value: "live_in_son", label: i18next.t("gen.pages.drama.dramaDisplay.gen_8ae84a74") },
  { value: "miracle_doctor", label: i18next.t("gen.pages.drama.dramaDisplay.gen_c5ba570c") },
  { value: "rich_family", label: i18next.t("gen.pages.drama.dramaDisplay.gen_7215b34f") },
  { value: "sweet_love", label: i18next.t("gen.pages.drama.dramaDisplay.gen_54b1fbc7") },
  { value: "hidden_identity", label: i18next.t("gen.pages.drama.dramaDisplay.gen_c3915dbe") },
] as const;

export const DRAMA_SOURCE_LABELS: Record<DramaSourceType, string> = {
  novel_import: i18next.t("gen.pages.drama.dramaDisplay.gen_a14e7eef"),
  original: i18next.t("gen.pages.drama.dramaDisplay.gen_4b6c8cee"),
  text_import: i18next.t("gen.pages.drama.dramaDisplay.gen_8ffd512f"),
};

export function dramaTrackLabel(track?: string | null): string {
  if (!track) {
    return i18next.t("gen.pages.drama.dramaDisplay.gen_a1b43f87");
  }
  return DRAMA_TRACK_OPTIONS.find((option) => option.value === track)?.label ?? track;
}
