const WORKFLOW_ACTIVITY_TAGS = [
  "Assets are being reintroduced",
  "Character development",
  "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
  "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
  "The foreshadowing ledger is being synchronized",
  "Ledger calibration in progress",
  "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
] as const;

export function extractWorkflowActivityTags(value: string | null | undefined): string[] {
  const source = value?.trim() ?? "";
  if (!source) {
    return [];
  }
  return WORKFLOW_ACTIVITY_TAGS.filter((label) => source.includes(label));
}
