export interface MobileNovelWorkspaceStepDefinition<Key extends string = string> {
  key: Key;
  label: string;
}

export interface MobileNovelWorkspaceStep<Key extends string = string> extends MobileNovelWorkspaceStepDefinition<Key> {
  isActive: boolean;
  isRecommended: boolean;
}

export function buildMobileNovelWorkspaceSteps<Key extends string>(input: {
  activeTab: Key;
  workflowCurrentTab?: Key | null;
  steps: ReadonlyArray<MobileNovelWorkspaceStepDefinition<Key>>;
}): Array<MobileNovelWorkspaceStep<Key>> {
  const workflowCurrentTab = input.workflowCurrentTab ?? input.activeTab;

  return input.steps.map((step) => ({
    ...step,
    isActive: step.key === input.activeTab,
    isRecommended: step.key === workflowCurrentTab && step.key !== input.activeTab,
  }));
}

export function getMobileNovelWorkspaceStatusText(input: {
  activeLabel: string;
  workflowLabel?: string | null;
}) {
  if (input.workflowLabel && input.workflowLabel !== input.activeLabel) {
    return `当前在${input.activeLabel}，AI 建议继续${input.workflowLabel}。`;
  }

  return `当前在${input.activeLabel}。`;
}
