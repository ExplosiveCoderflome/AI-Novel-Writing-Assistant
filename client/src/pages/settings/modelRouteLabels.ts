import type { ModelRouteTaskType } from "@ai-novel/shared/types/novel";

export const MODEL_ROUTE_LABELS: Record<ModelRouteTaskType, { title: string; description: string }> = {
  planner: {
    title: "大纲策士",
    description: "先吃透你的要求，再安排这段创作该怎么推进。",
  },
  small_text: {
    title: "短文本处理",
    description: "处理提示短、上下文轻的后台同步与维护类请求，避免挤占主规划模型。",
  },
  writer: {
    title: "主笔作家",
    description: "真正动笔写正文，把章节内容完整落下来。",
  },
  review: {
    title: "审稿编修",
    description: "专门盯剧情、节奏和文风，找出稿子里的毛病。",
  },
  repair: {
    title: "润稿匠人",
    description: "根据问题回头修文，把不顺的地方重新打磨。",
  },
  summary: {
    title: "剧情摘录师",
    description: "把长章节浓缩成回顾、摘要和重点梳理。",
  },
  fact_extraction: {
    title: "设定考据官",
    description: "整理设定、时间线和关键事实，防止写着写着前后打架。",
  },
  chat: {
    title: "灵感陪写",
    description: "负责日常对话，把结果整理成创作时能直接理解的话。",
  },
};
