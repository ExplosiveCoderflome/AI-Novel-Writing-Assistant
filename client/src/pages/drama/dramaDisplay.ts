import type { DramaSourceType } from "@/api/drama";

export const DRAMA_TRACK_OPTIONS = [
  { value: "counterattack", label: "Counterattack" },
  { value: "rebirth_revenge", label: "Rebirth for Revenge" },
  { value: "war_god", label: "Return of the God of War" },
  { value: "live_in_son", label: "son-in-law" },
  { value: "miracle_doctor", label: "miracle doctor" },
  { value: "rich_family", label: "Grudges between wealthy families" },
  { value: "sweet_love", label: "sweet pet" },
  { value: "hidden_identity", label: "Ma Jia Wen" },
] as const;

export const DRAMA_SOURCE_LABELS: Record<DramaSourceType, string> = {
  novel_import: "Novel import",
  original: "Original short play",
  text_import: "Text import",
};

export function dramaTrackLabel(track?: string | null): string {
  if (!track) {
    return "No track selected";
  }
  return DRAMA_TRACK_OPTIONS.find((option) => option.value === track)?.label ?? track;
}
