import type { ModelRouteTaskType } from "@ai-novel/shared/types/novel";

export const MODEL_ROUTE_LABELS: Record<ModelRouteTaskType, { title: string; description: string }> = {
  planner: {
    title: "outline planning",
    description: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
  },
  writer: {
    title: "Chief writing",
    description: "Generate chapter text and write out the chapter content completely.",
  },
  review: {
    title: "General school",
    description: "Check plot, pacing, and style to identify quality issues in your draft.",
  },
  light_review: {
    title: "Basic quick review",
    description: "Quickly determine whether a chapter can be advanced and used for lightweight quality checks after the main text.",
  },
  critical_review: {
    title: "Strict review",
    description: "Handles quality checks that affect the continuity of the entire book, suitable for high-risk review and rechecking.",
  },
  repair: {
    title: "Chapter fixes",
    description: "Correct the manuscript according to the review issues and return the chapter to a state where it can be moved forward.",
  },
  replan: {
    title: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    description: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
  },
  state_resolution: {
    title: "State analysis",
    description: "Determine whether the chapter status proposal is credible and help automatic directors reduce manual confirmation.",
  },
  summary: {
    title: "Plot summary",
    description: "Organize long chapters into reviews, summaries, and key changes.",
  },
  fact_extraction: {
    title: "Setting testimonials",
    description: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
  },
  chat: {
    title: "Inspiration to accompany writing",
    description: "Take everyday conversations and organize the results into content that can be directly understood at the time of creation.",
  },
};
