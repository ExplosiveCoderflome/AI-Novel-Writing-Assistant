import {
  DIRECTOR_IDEA_CONSTELLATION_CATEGORIES,
  type DirectorIdeaConstellationCategory,
  type DirectorIdeaConstellationOption,
  type DirectorIdeaConstellationSelection,
} from "@ai-novel/shared/types/novelDirector";

export const IDEA_CONSTELLATION_CATEGORY_LABELS: Record<DirectorIdeaConstellationCategory, string> = {
  protagonist: "人物底色",
  setting: "世界压力",
  opening_crisis: "开局钩子",
  core_goal: "长线欲望",
  story_variable: "关键变量",
  relationship: "关系张力",
};

export interface FoundationConstellationOption {
  id: string;
  label: string;
  hint: string;
}

export function orderIdeaConstellationOptions(
  options: DirectorIdeaConstellationOption[],
): DirectorIdeaConstellationOption[] {
  const byCategory = new Map(DIRECTOR_IDEA_CONSTELLATION_CATEGORIES.map((category) => [
    category,
    options.filter((option) => option.category === category).sort((left, right) => left.id.localeCompare(right.id)),
  ]));
  return Array.from({ length: 4 }, (_, optionIndex) => (
    DIRECTOR_IDEA_CONSTELLATION_CATEGORIES.map((category) => byCategory.get(category)?.[optionIndex])
  )).flat().filter((option): option is DirectorIdeaConstellationOption => Boolean(option));
}

export function toggleIdeaConstellationSelection(
  selected: DirectorIdeaConstellationSelection[],
  option: DirectorIdeaConstellationOption,
): DirectorIdeaConstellationSelection[] {
  if (selected.some((item) => item.id === option.id)) {
    return selected.filter((item) => item.id !== option.id);
  }
  return [
    ...selected.filter((item) => item.category !== option.category),
    { id: option.id, category: option.category, label: option.label, hint: option.hint },
  ];
}

export function selectRotatingFoundationOptions(
  options: FoundationConstellationOption[],
  page: number,
  selectedId: string,
  size = 3,
): FoundationConstellationOption[] {
  if (options.length <= size) return options;
  const start = (((page * size) % options.length) + options.length) % options.length;
  const rotated = Array.from({ length: size }, (_, index) => options[(start + index) % options.length]);
  const selected = options.find((option) => option.id === selectedId);
  if (!selected || rotated.some((option) => option.id === selected.id)) return rotated;
  return [...rotated.slice(0, -1), selected];
}
