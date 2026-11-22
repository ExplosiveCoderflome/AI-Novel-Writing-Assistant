import type { DirectorIdeaConstellationCategory } from "@ai-novel/shared/types/novelDirector";

export type ChartPoint = readonly [x: number, y: number];

interface ConstellationFigure {
  center: ChartPoint;
  stars: readonly ChartPoint[];
}

// The chart uses one 480-unit square at every size. Only short category names
// sit on this plate. Candidate sentences flow normally in the reading column.
export const CONSTELLATION_FIGURES = {
  protagonist: { center: [162, 117], stars: [[-29, 3], [-13, -4], [-3, -20], [13, -10], [28, -17]] },
  setting: { center: [314, 121], stars: [[-30, -3], [-8, -14], [8, 0], [16, -20], [32, -7]] },
  advantage: { center: [94, 230], stars: [[-21, 6], [-5, -10], [4, -25], [12, -6], [28, -3]] },
  opening_crisis: { center: [233, 222], stars: [[-32, -15], [-14, -1], [1, -11], [12, 3], [30, -18]] },
  core_goal: { center: [373, 239], stars: [[-27, 8], [-11, -9], [2, -3], [13, -18], [28, -27]] },
  story_variable: { center: [162, 334], stars: [[-28, -1], [-12, -14], [0, -5], [19, -16], [26, 3]] },
  relationship: { center: [303, 340], stars: [[-26, -16], [-16, 2], [0, -5], [14, 2], [27, -15]] },
} as const satisfies Record<DirectorIdeaConstellationCategory, ConstellationFigure>;
