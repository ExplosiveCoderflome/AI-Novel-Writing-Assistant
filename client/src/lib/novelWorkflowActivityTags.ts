const WORKFLOW_ACTIVITY_TAGS = [
  "资产回灌中",
  "角色成长中",
  "状态同步中",
  "资源账本同步中",
  "伏笔账本同步中",
  "账本校准中",
  "伏笔回填中",
] as const;

export function extractWorkflowActivityTags(value: string | null | undefined): string[] {
  const source = value?.trim() ?? "";
  if (!source) {
    return [];
  }
  return WORKFLOW_ACTIVITY_TAGS.filter((label) => source.includes(label));
}
