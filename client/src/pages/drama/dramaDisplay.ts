import type { DramaSourceType } from "@/api/drama";

export const DRAMA_TRACK_OPTIONS = [
  { value: "counterattack", label: "逆袭" },
  { value: "rebirth_revenge", label: "重生复仇" },
  { value: "war_god", label: "战神归来" },
  { value: "live_in_son", label: "赘婿" },
  { value: "miracle_doctor", label: "神医" },
  { value: "rich_family", label: "豪门恩怨" },
  { value: "sweet_love", label: "甜宠" },
  { value: "hidden_identity", label: "马甲文" },
] as const;

export const DRAMA_SOURCE_LABELS: Record<DramaSourceType, string> = {
  novel_import: "小说导入",
  original: "原创短剧",
  text_import: "文本导入",
};

export function dramaTrackLabel(track?: string | null): string {
  if (!track) {
    return "未选择赛道";
  }
  return DRAMA_TRACK_OPTIONS.find((option) => option.value === track)?.label ?? track;
}
