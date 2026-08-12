import i18next from "i18next";

export type WritingFormulaPresetKey = "imitate" | "balanced" | "transfer";

export interface WritingFormulaPresetOption {
  key: WritingFormulaPresetKey;
  label: string;
  description: string;
  recommended?: boolean;
}

export const WRITING_FORMULA_PRESETS: WritingFormulaPresetOption[] = [
  {
    key: "imitate",
    label: i18next.t("dict.gen_439fbac9", { defaultValue: "复刻精仿" }),
    description: i18next.t("dict.gen_5d8f63ab", { defaultValue: "高度还原原文本的语言习惯与角色语气" }),
  },
  {
    key: "balanced",
    label: i18next.t("dict.gen_d0e40880", { defaultValue: "平衡适配" }),
    description: i18next.t("dict.gen_4b9a12c8", { defaultValue: "提炼核心文风特征，兼顾不同故事题材" }),
    recommended: true,
  },
  {
    key: "transfer",
    label: i18next.t("dict.gen_74f9d6c7", { defaultValue: "跨界迁移" }),
    description: i18next.t("dict.gen_e2a149b0", { defaultValue: "只保留底层节奏与情绪抓手，用于全新题材" }),
  },
];

export const DEFAULT_WRITING_FORMULA_PRESET_KEY: WritingFormulaPresetKey = "balanced";
