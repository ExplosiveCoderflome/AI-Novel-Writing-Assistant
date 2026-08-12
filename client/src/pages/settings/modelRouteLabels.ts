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
    title: "文生图 / 角色与插图生成",
    description: "多媒体小说插图、角色人设图生成。推荐绑定 ComfyUI、SenseNova 或 SiliconFlow。",
  },
  video_gen: {
    title: "文生视频 / 动态推演",
    description: "小说分镜镜头与故事动态视频推演。推荐绑定 ComfyUI 或 SiliconFlow 视频生成器。",
  },
  embedding: {
    title: "向量 Embedding 嵌入",
    description: "知识库检索、语义相关度向量提取。推荐绑定 Ollama 本地 embeddinggemma 或 BGE-M3。",
  },
  asr: {
    title: "ASR 语音识别",
    description: "语音输入转文字创作。推荐绑定 SenseVoice 或 Whisper 语音识别引擎。",
  },
  tts: {
    title: "TTS 语音朗读与合成",
    description: "小说有声书朗读与角色配音合成。推荐绑定 CosyVoice 或 EdgeTTS 引擎。",
  },
  ocr: {
    title: "OCR 图文识别解析",
    description: "扫描件、设定集手稿图片转结构化大纲文本。推荐绑定 Step-Vision 或 GOT-OCR 视效模型。",
  },
};
