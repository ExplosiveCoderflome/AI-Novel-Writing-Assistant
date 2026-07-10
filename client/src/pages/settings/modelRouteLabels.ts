import i18next from "i18next";
import type { ModelRouteTaskType } from "@ai-novel/shared/types/novel";

export const MODEL_ROUTE_LABELS: Record<ModelRouteTaskType, { title: string; description: string }> = {
  planner: {
    title: i18next.t("gen.pages.settings.modelRouteLabels.gen_e1288c86"),
    description: i18next.t("gen.pages.settings.modelRouteLabels.gen_894511e5"),
  },
  writer: {
    title: i18next.t("gen.pages.settings.modelRouteLabels.mainPenWriting"),
    description: i18next.t("gen.pages.settings.modelRouteLabels.gen_cb6746c7"),
  },
  review: {
    title: i18next.t("gen.pages.settings.modelRouteLabels.gen_4daf9c95"),
    description: i18next.t("gen.pages.settings.modelRouteLabels.gen_bd421abe"),
  },
  light_review: {
    title: i18next.t("gen.pages.settings.modelRouteLabels.gen_9ff7a878"),
    description: i18next.t("gen.pages.settings.modelRouteLabels.gen_b0383283"),
  },
  critical_review: {
    title: i18next.t("gen.pages.settings.modelRouteLabels.strictReview"),
    description: i18next.t("gen.pages.settings.modelRouteLabels.gen_f020e3b9"),
  },
  repair: {
    title: i18next.t("gen.pages.settings.modelRouteLabels.gen_96e75da2"),
    description: i18next.t("gen.pages.settings.modelRouteLabels.gen_844b5a1c"),
  },
  replan: {
    title: i18next.t("gen.pages.settings.modelRouteLabels.gen_b7bb8d7f"),
    description: i18next.t("gen.pages.settings.modelRouteLabels.gen_9377c103"),
  },
  state_resolution: {
    title: i18next.t("gen.pages.settings.modelRouteLabels.gen_7009cd9b"),
    description: i18next.t("gen.pages.settings.modelRouteLabels.gen_5100393d"),
  },
  summary: {
    title: i18next.t("gen.pages.settings.modelRouteLabels.gen_45b6ab43"),
    description: i18next.t("gen.pages.settings.modelRouteLabels.gen_85f01628"),
  },
  fact_extraction: {
    title: i18next.t("gen.pages.settings.modelRouteLabels.gen_ce700de7"),
    description: i18next.t("gen.pages.settings.modelRouteLabels.gen_1454e3a6"),
  },
  chat: {
    title: i18next.t("gen.pages.settings.modelRouteLabels.gen_2fd6760d"),
    description: i18next.t("gen.pages.settings.modelRouteLabels.gen_d6fdce38"),
  },
};
