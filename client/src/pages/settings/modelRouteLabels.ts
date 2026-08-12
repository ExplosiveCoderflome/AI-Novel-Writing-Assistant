import i18next from "i18next";
import type { ModelRouteTaskType } from "@ai-novel/shared/types/novel";

export const MODEL_ROUTE_LABELS: Record<ModelRouteTaskType, { title: string; description: string }> = {
  planner: {
    title: i18next.t("dict.gen_e1288c86"),
    description: i18next.t("dict.gen_894511e5"),
  },
  writer: {
    title: i18next.t("dict.mainPenWriting"),
    description: i18next.t("dict.gen_cb6746c7"),
  },
  review: {
    title: i18next.t("dict.gen_4daf9c95"),
    description: i18next.t("dict.gen_bd421abe"),
  },
  light_review: {
    title: i18next.t("dict.gen_9ff7a878"),
    description: i18next.t("dict.gen_b0383283"),
  },
  critical_review: {
    title: i18next.t("dict.strictReview"),
    description: i18next.t("dict.gen_f020e3b9"),
  },
  repair: {
    title: i18next.t("dict.gen_96e75da2"),
    description: i18next.t("dict.gen_844b5a1c"),
  },
  replan: {
    title: i18next.t("dict.gen_b7bb8d7f"),
    description: i18next.t("dict.gen_9377c103"),
  },
  state_resolution: {
    title: i18next.t("dict.gen_7009cd9b"),
    description: i18next.t("dict.gen_5100393d"),
  },
  summary: {
    title: i18next.t("dict.gen_45b6ab43"),
    description: i18next.t("dict.gen_85f01628"),
  },
  fact_extraction: {
    title: i18next.t("dict.gen_ce700de7"),
    description: i18next.t("dict.gen_1454e3a6"),
  },
  chat: {
    title: i18next.t("dict.gen_2fd6760d"),
    description: i18next.t("dict.gen_d6fdce38"),
  },
  image_gen: {
    title: i18next.t("settings.modelRouteLabels.uf82hs"),
    description: i18next.t("settings.modelRouteLabels.vpf95b"),
  },
  video_gen: {
    title: i18next.t("settings.modelRouteLabels.dbdai5"),
    description: i18next.t("settings.modelRouteLabels.yn5bax"),
  },
  embedding: {
    title: i18next.t("settings.modelRouteLabels.y5c6ck"),
    description: i18next.t("settings.modelRouteLabels.f82kwq"),
  },
  asr: {
    title: i18next.t("settings.modelRouteLabels.nz4f7v"),
    description: i18next.t("settings.modelRouteLabels.bqoqks"),
  },
  tts: {
    title: i18next.t("settings.modelRouteLabels.j2vyu7"),
    description: i18next.t("settings.modelRouteLabels.wml1iu"),
  },
  ocr: {
    title: i18next.t("settings.modelRouteLabels.pux6vx"),
    description: i18next.t("settings.modelRouteLabels.wjis84"),
  },
};
