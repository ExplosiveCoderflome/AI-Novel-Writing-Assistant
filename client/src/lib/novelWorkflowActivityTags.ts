const WORKFLOW_ACTIVITY_TAGS = [
  "角色成长中",
  "状态同步中",
  "伏笔回填中",
] as const;

export function extractWorkflowActivityTags(value: string | null | undefined): string[] {
  const source = value?.trim() ?? "";
  if (!source) {
    return [];
  }
  return WORKFLOW_ACTIVITY_TAGS.filter((label) => source.includes(label));
}
