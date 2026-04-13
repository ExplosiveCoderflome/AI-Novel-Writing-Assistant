import type { CreativeHubNovelSetupStatus } from "@ai-novel/shared/types/creativeHub";

function stageLabel(stage: CreativeHubNovelSetupStatus["stage"]): string {
  switch (stage) {
    case "ready_for_production":
      return "已具备启动整本生产的基础";
    case "ready_for_planning":
      return "已具备进入大纲规划的基础";
    default:
      return "仍在初始化阶段";
  }
}

export function parseNovelSetupStatus(value: unknown): CreativeHubNovelSetupStatus | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.novelId !== "string"
    || typeof record.title !== "string"
    || typeof record.stage !== "string"
    || typeof record.nextQuestion !== "string"
    || typeof record.recommendedAction !== "string"
    || !Array.isArray(record.missingItems)
  ) {
    return null;
  }
  return record as unknown as CreativeHubNovelSetupStatus;
}

export function buildNovelSetupGuidanceFacts(setup: CreativeHubNovelSetupStatus): string {
  const missing = setup.missingItems.slice(0, 5).join("、");
  const priorityItem = setup.checklist
    .find((item) => item.requiredForProduction && item.status !== "ready")
    ?? setup.checklist.find((item) => item.status !== "ready");
  const currentValue = priorityItem?.currentValue?.trim();
  const lines = [
    `小说标题：${setup.title}`,
    `当前阶段：${stageLabel(setup.stage)}`,
    `完成度：${setup.completedCount}/${setup.totalCount}（${setup.completionRatio}%）`,
    `待补项目：${missing || "暂无"}`,
    `优先补充：${priorityItem?.label ?? "暂无"}`,
    `系统建议提问：${setup.nextQuestion}`,
    `系统建议动作：${setup.recommendedAction}`,
  ];

  if (currentValue) {
    lines.push(`该项当前已有信息：${currentValue}`);
  }

  return lines.join("\n");
}

export function formatNovelSetupGuidance(prefix: string, setup: CreativeHubNovelSetupStatus): string {
  const missing = setup.missingItems.slice(0, 3).join("、");
  const lines = [prefix];

  lines.push(`当前状态：${stageLabel(setup.stage)}（${setup.completedCount}/${setup.totalCount} 项已就绪）。`);
  if (missing) {
    lines.push(`接下来还需要补齐 ${missing}${setup.missingItems.length > 3 ? " 等" : ""}。`);
  }
  lines.push(`我们先聊这个：${setup.nextQuestion}`);
  lines.push(`如果你暂时没想好，我也可以先给你几组备选方向。`);

  return lines.join("\n");
}
