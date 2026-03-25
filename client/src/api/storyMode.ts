import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { NovelStoryMode, StoryModeProfile } from "@ai-novel/shared/types/storyMode";
import { apiClient } from "./client";

export interface StoryModeTreeNode extends NovelStoryMode {
  childCount: number;
  novelCount: number;
  children: StoryModeTreeNode[];
}

export interface StoryModeTreeDraft {
  name: string;
  description?: string;
  template?: string;
  profile: StoryModeProfile;
  children: StoryModeTreeDraft[];
}

export interface StoryModeOption {
  id: string;
  name: string;
  label: string;
  path: string;
  level: number;
  description?: string | null;
  template?: string | null;
  profile: StoryModeProfile;
}

export async function getStoryModeTree() {
  const { data } = await apiClient.get<ApiResponse<StoryModeTreeNode[]>>("/story-modes");
  return data;
}

export async function createStoryModeTree(payload: {
  name: string;
  description?: string;
  template?: string;
  profile: StoryModeProfile;
  parentId?: string | null;
  children?: StoryModeTreeDraft[];
}) {
  const { data } = await apiClient.post<ApiResponse<NovelStoryMode>>("/story-modes", payload);
  return data;
}

export async function updateStoryMode(
  id: string,
  payload: Partial<{
    name: string;
    description: string | null;
    template: string | null;
    profile: StoryModeProfile;
    parentId: string | null;
  }>,
) {
  const { data } = await apiClient.put<ApiResponse<NovelStoryMode>>(`/story-modes/${id}`, payload);
  return data;
}

export async function deleteStoryMode(id: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/story-modes/${id}`);
  return data;
}

export async function generateStoryModeTree(payload: {
  prompt: string;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}) {
  const { data } = await apiClient.post<ApiResponse<StoryModeTreeDraft>>("/story-modes/generate", payload);
  return data;
}

export function flattenStoryModeTreeOptions(
  nodes: StoryModeTreeNode[],
  level = 0,
  path: string[] = [],
): StoryModeOption[] {
  return nodes.flatMap((node) => {
    const nextPath = [...path, node.name];
    const current: StoryModeOption = {
      id: node.id,
      name: node.name,
      label: `${level > 0 ? `${"· ".repeat(level)}` : ""}${node.name}`,
      path: nextPath.join(" / "),
      level,
      description: node.description ?? null,
      template: node.template ?? null,
      profile: node.profile,
    };
    return [current, ...flattenStoryModeTreeOptions(node.children, level + 1, nextPath)];
  });
}
