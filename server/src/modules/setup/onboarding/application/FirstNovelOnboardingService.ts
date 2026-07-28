import type {
  FirstNovelMilestone,
  FirstNovelMilestoneKey,
  FirstNovelOnboardingProjection,
} from "@ai-novel/shared/types/onboarding";
import type { NovelWorkflowCheckpoint } from "@ai-novel/shared/types/novelWorkflow";
import type { TaskStatus } from "@ai-novel/shared/types/task";
import { prisma } from "../../../../db/prisma";
import { getQuickSetupStatus } from "./QuickSetupService";

const MILESTONE_DEFINITIONS: Array<Pick<FirstNovelMilestone, "key" | "title" | "description">> = [
  { key: "environment", title: "创作环境", description: "配置一个能完成规划、正文和审校的文本模型。" },
  { key: "idea_direction", title: "灵感与方向", description: "写下一句话灵感，并从 AI 给出的方向中选择一套。" },
  { key: "preparation", title: "开书准备", description: "AI 准备故事、世界、角色、卷章规划和执行资源。" },
  { key: "production_choice", title: "生产方式", description: "选择 AI 持续写完整本书，或进入专业工作台。" },
  { key: "first_chapter", title: "首章成稿", description: "等待第一章完成后，打开正文开始阅读。" },
];

function milestoneIndex(key: FirstNovelMilestoneKey): number {
  return MILESTONE_DEFINITIONS.findIndex((item) => item.key === key);
}

function buildMilestones(
  current: FirstNovelMilestoneKey,
  attention: boolean,
  summaries: Partial<Record<FirstNovelMilestoneKey, string>>,
): FirstNovelMilestone[] {
  const currentIndex = milestoneIndex(current);
  return MILESTONE_DEFINITIONS.map((item, index) => ({
    ...item,
    status: index < currentIndex
      ? "completed"
      : index === currentIndex
        ? attention ? "attention" : "current"
        : "pending",
    resultSummary: summaries[item.key] ?? null,
  }));
}

export async function getFirstNovelOnboardingProjection(): Promise<FirstNovelOnboardingProjection> {
  const [setup, firstReadableChapter, latestTask, latestNovel] = await Promise.all([
    getQuickSetupStatus(),
    prisma.chapter.findFirst({
      where: {
        content: { not: "" },
        OR: [
          { chapterStatus: "completed" },
          { generationState: { in: ["approved", "published"] } },
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { order: "asc" }],
      select: {
        id: true,
        title: true,
        order: true,
        novelId: true,
        novel: {
          select: {
            id: true,
            title: true,
            creationExperience: true,
          },
        },
      },
    }),
    prisma.novelWorkflowTask.findFirst({
      where: { lane: "auto_director" },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        novelId: true,
        status: true,
        checkpointType: true,
        currentStage: true,
        currentItemLabel: true,
        lastError: true,
        novel: {
          select: {
            id: true,
            title: true,
            creationExperience: true,
          },
        },
      },
    }),
    prisma.novel.findFirst({
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        title: true,
        creationExperience: true,
      },
    }),
  ]);

  const task = latestTask ? {
    id: latestTask.id,
    status: latestTask.status as TaskStatus,
    checkpointType: latestTask.checkpointType as NovelWorkflowCheckpoint | null,
    currentStage: latestTask.currentStage,
    currentItemLabel: latestTask.currentItemLabel,
    lastError: latestTask.lastError,
  } : null;
  const novel = latestTask?.novel ?? firstReadableChapter?.novel ?? latestNovel ?? null;
  const isAttention = latestTask?.status === "failed"
    || latestTask?.status === "cancelled"
    || Boolean(latestTask?.lastError);
  const summaries: Partial<Record<FirstNovelMilestoneKey, string>> = {
    ...(setup.readyForCreation ? { environment: `${setup.selectedProvider ?? "模型"} · ${setup.selectedModel ?? "可用"}` } : {}),
    ...(novel ? { idea_direction: `《${novel.title}》` } : {}),
    ...(latestTask?.novelId ? { preparation: latestTask.currentItemLabel ?? "开书资源正在准备" } : {}),
    ...(novel?.creationExperience ? {
      production_choice: novel.creationExperience === "simple" ? "简易创作" : "专业创作",
    } : {}),
    ...(firstReadableChapter ? { first_chapter: `《${firstReadableChapter.title}》可阅读` } : {}),
  };

  let currentMilestone: FirstNovelMilestoneKey = "environment";
  let headline = "先完成一次快捷配置";
  let description = "只需要一个可用文本模型，系统会自动准备整条创作链的任务路由。";
  let reason = "自动导演、正文生成和审校都需要稳定的模型连接。";
  let primaryAction: FirstNovelOnboardingProjection["primaryAction"] = {
    label: "快捷配置模型",
    route: "/help",
    kind: "open_quick_setup",
  };

  if (setup.readyForCreation) {
    currentMilestone = "idea_direction";
    headline = "用一句灵感开始第一本小说";
    description = "不需要先写大纲，AI 会整理出两套完整方向供你选择。";
    reason = "先确认值得继续写的整书方向，比填写大量专业设定更重要。";
    primaryAction = {
      label: "让 AI 带我开始",
      route: "/novels/auto-director",
      kind: "navigate",
    };
  }

  if (setup.readyForCreation && latestTask) {
    if (latestTask.checkpointType === "candidate_selection_required" || !latestTask.novelId) {
      primaryAction = {
        label: latestTask.checkpointType === "candidate_selection_required" ? "选择整书方向" : "查看方向生成进度",
        route: `/novels/auto-director?taskId=${latestTask.id}`,
        kind: "navigate",
      };
      headline = latestTask.checkpointType === "candidate_selection_required"
        ? "选择你最想读下去的方向"
        : "AI 正在准备整书方向";
      description = latestTask.currentItemLabel ?? "方向完成后，你只需要从两套方案中选择一套。";
      reason = "这个选择会确定主角、核心冲突和整本书的主要阅读期待。";
    } else if (latestTask.checkpointType === "production_experience_required") {
      currentMilestone = "production_choice";
      headline = "开书准备完成，选择正文生产方式";
      description = "简易创作会持续写完整本书；专业创作会进入完整可编辑工作台。";
      reason = "故事、角色和卷章资源都已准备好，正文尚未启动。";
      primaryAction = {
        label: "选择生产方式",
        route: `/novels/${latestTask.novelId}/edit?directorTaskId=${latestTask.id}`,
        kind: "navigate",
      };
    } else if (
      latestTask.novel?.creationExperience === "simple"
      || latestTask.checkpointType === "chapter_batch_ready"
      || latestTask.currentStage === "chapter_execution"
      || latestTask.currentStage === "quality_repair"
    ) {
      currentMilestone = "first_chapter";
      headline = isAttention ? "首章生产需要处理" : "AI 正在完成第一章";
      description = isAttention
        ? latestTask.lastError ?? "查看安全暂停原因，处理后即可继续。"
        : latestTask.currentItemLabel ?? "正文完成并通过审校后，就会开放阅读。";
      reason = isAttention
        ? "从当前检查点恢复会保留已保存的规划和正文。"
        : "正在生成的正文不会提前展示，避免你读到尚未稳定的版本。";
      primaryAction = {
        label: isAttention ? "查看并恢复" : "查看章节书架",
        route: latestTask.novel?.creationExperience === "simple"
          ? `/novels/${latestTask.novelId}/simple`
          : `/novels/${latestTask.novelId}/edit?directorTaskId=${latestTask.id}`,
        kind: isAttention ? "resume" : "navigate",
      };
    } else {
      currentMilestone = "preparation";
      headline = isAttention ? "开书准备需要处理" : "AI 正在准备开书资源";
      description = isAttention
        ? latestTask.lastError ?? "查看当前任务的恢复建议。"
        : latestTask.currentItemLabel ?? "系统正在准备故事、角色和卷章规划。";
      reason = isAttention
        ? "从当前检查点恢复即可，不需要重新创建小说。"
        : "这些资源会直接驱动后续章节，不需要你逐项审核。";
      primaryAction = {
        label: isAttention ? "查看并恢复" : "查看准备进度",
        route: `/novels/${latestTask.novelId}/edit?directorTaskId=${latestTask.id}`,
        kind: isAttention ? "resume" : "navigate",
      };
    }
  } else if (setup.readyForCreation && novel) {
    currentMilestone = "first_chapter";
    headline = "继续完成第一章";
    description = "项目可继续推进，进入工作台准备或生成首章正文。";
    reason = "第一章成稿后，你就跑通了从灵感到正文的完整链路。";
    primaryAction = {
      label: novel.creationExperience === "simple" ? "打开章节书架" : "继续当前项目",
      route: novel.creationExperience === "simple" ? `/novels/${novel.id}/simple` : `/novels/${novel.id}/edit`,
      kind: "navigate",
    };
  }

  const graduated = Boolean(firstReadableChapter && setup.readyForCreation);
  if (graduated && firstReadableChapter) {
    currentMilestone = "first_chapter";
    headline = "第一章可以阅读";
    description = `《${firstReadableChapter.title}》形成可读成稿，从灵感到正文的完整流程顺利跑通。`;
    reason = "接下来可以继续观察整书生产，或进入工作台完善后续内容。";
    primaryAction = {
      label: "阅读第一章",
      route: firstReadableChapter.novel.creationExperience === "simple"
        ? `/novels/${firstReadableChapter.novelId}/simple?chapterId=${firstReadableChapter.id}`
        : `/novels/${firstReadableChapter.novelId}/chapters/${firstReadableChapter.id}`,
      kind: "navigate",
    };
  }

  const milestones = buildMilestones(currentMilestone, isAttention && !graduated, summaries);
  if (graduated) {
    milestones.forEach((milestone) => {
      milestone.status = "completed";
    });
  }

  return {
    graduated,
    currentMilestone,
    completedCount: graduated
      ? MILESTONE_DEFINITIONS.length
      : milestones.filter((milestone) => milestone.status === "completed").length,
    totalCount: MILESTONE_DEFINITIONS.length,
    headline,
    description,
    reason,
    primaryAction,
    novel: novel ? {
      id: novel.id,
      title: novel.title,
      creationExperience: novel.creationExperience,
    } : null,
    directorTask: task,
    firstReadableChapter: firstReadableChapter ? {
      id: firstReadableChapter.id,
      title: firstReadableChapter.title,
      order: firstReadableChapter.order,
      novelId: firstReadableChapter.novelId,
    } : null,
    milestones,
    optionalEnhancements: [
      {
        key: "knowledge",
        title: "知识库",
        description: "需要参考资料或长期设定时再启用，不影响开始创作。",
        route: "/knowledge",
      },
      {
        key: "style",
        title: "写法引擎",
        description: "有明确文风样本后再提取写法，首章创作无需等待这项配置。",
        route: "/style-engine",
      },
      {
        key: "image",
        title: "图像能力",
        description: "需要封面或角色图时再配置图像模型。",
        route: "/settings",
      },
    ],
  };
}
