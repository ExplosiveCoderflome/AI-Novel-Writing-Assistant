import type { WorkflowActionDefinition, WorkflowDefinition } from "./workflowTypes";

export const productionWorkflowDefinitions: WorkflowDefinition[] = [
  {
    id: "create_novel",
    intent: "create_novel",
    kind: "workflow",
    resolve: ({ intent }) => intent.novelTitle
      ? [{
        agent: "Planner",
        tool: "create_novel",
        reason: `创建小说《${intent.novelTitle}》`,
        input: { title: intent.novelTitle },
        keyPrefix: `create_novel_${intent.novelTitle}`,
      }]
      : [],
  },
  {
    id: "bind_world_to_novel",
    intent: "bind_world_to_novel",
    kind: "workflow",
    resolve: ({ intent, plannerInput }) => plannerInput.novelId && intent.worldName
      ? [{
        agent: "Planner",
        tool: "bind_world_to_novel",
        reason: `将《${intent.worldName}》绑定为当前小说世界观`,
        input: {
          novelId: plannerInput.novelId,
          worldName: intent.worldName,
        },
        keyPrefix: `bind_world_${intent.worldName}`,
      }]
      : [],
  },
  {
    id: "unbind_world_from_novel",
    intent: "unbind_world_from_novel",
    kind: "workflow",
    resolve: ({ plannerInput }) => plannerInput.novelId
      ? [{
        agent: "Planner",
        tool: "unbind_world_from_novel",
        reason: "解除当前小说的世界观绑定",
        input: {
          novelId: plannerInput.novelId,
        },
        keyPrefix: "unbind_world",
      }]
      : [],
  },
  {
    id: "produce_novel",
    intent: "produce_novel",
    kind: "workflow",
    resolve: ({ intent, plannerInput }) => {
      const hasCurrentNovel = Boolean(plannerInput.novelId);
      if (!hasCurrentNovel && !intent.novelTitle) {
        return [];
      }

      const actions: WorkflowActionDefinition[] = [];

      if (!hasCurrentNovel && intent.novelTitle) {
        const createNovelInput: Record<string, unknown> = {
          title: intent.novelTitle,
        };
        if (intent.description) createNovelInput.description = intent.description;
        if (intent.genre) createNovelInput.genre = intent.genre;
        if (intent.styleTone) createNovelInput.styleTone = intent.styleTone;
        if (intent.projectMode) createNovelInput.projectMode = intent.projectMode;
        if (intent.pacePreference) createNovelInput.pacePreference = intent.pacePreference;
        if (intent.narrativePov) createNovelInput.narrativePov = intent.narrativePov;
        if (intent.emotionIntensity) createNovelInput.emotionIntensity = intent.emotionIntensity;
        if (intent.aiFreedom) createNovelInput.aiFreedom = intent.aiFreedom;
        if (typeof intent.defaultChapterLength === "number") createNovelInput.defaultChapterLength = intent.defaultChapterLength;

        actions.push({
          agent: "Planner",
          tool: "create_novel",
          reason: `创建小说《${intent.novelTitle}》`,
          input: createNovelInput,
          keyPrefix: `produce_create_${intent.novelTitle}`,
        });
      }

      if (!plannerInput.worldId) {
        actions.push({
          agent: "Planner",
          tool: "generate_world_for_novel",
          reason: "为当前小说生成世界观",
          input: {
            ...(intent.description ? { description: intent.description } : {}),
            ...(intent.worldType ? { worldType: intent.worldType } : {}),
          },
          keyPrefix: "produce_world",
        });
        actions.push({
          agent: "Planner",
          tool: "bind_world_to_novel",
          reason: "将生成的世界观绑定到当前小说",
          input: {},
          keyPrefix: "produce_bind_world",
        });
      }

      actions.push(
        {
          agent: "Planner",
          tool: "generate_novel_characters",
          reason: "生成核心角色设定",
          input: {
            ...(intent.description ? { description: intent.description } : {}),
            ...(intent.genre ? { genre: intent.genre } : {}),
            ...(intent.styleTone ? { styleTone: intent.styleTone } : {}),
            ...(intent.narrativePov ? { narrativePov: intent.narrativePov } : {}),
          },
          keyPrefix: "produce_characters",
        },
        {
          agent: "Planner",
          tool: "generate_story_bible",
          reason: "生成小说圣经",
          input: {},
          keyPrefix: "produce_bible",
        },
        {
          agent: "Planner",
          tool: "generate_novel_outline",
          reason: "生成发展走向",
          input: {
            ...(intent.description ? { description: intent.description } : {}),
          },
          keyPrefix: "produce_outline",
        },
        {
          agent: "Planner",
          tool: "generate_structured_outline",
          reason: "生成结构化大纲",
          input: {
            targetChapterCount: intent.targetChapterCount ?? 20,
          },
          keyPrefix: "produce_structured_outline",
        },
        {
          agent: "Planner",
          tool: "sync_chapters_from_structured_outline",
          reason: "根据结构化大纲同步章节目录",
          input: {},
          keyPrefix: "produce_sync_chapters",
        },
        {
          agent: "Planner",
          tool: "preview_pipeline_run",
          reason: "预览整本写作范围",
          input: {
            startOrder: 1,
            endOrder: intent.targetChapterCount ?? 20,
          },
          keyPrefix: "produce_preview_pipeline",
        },
        {
          agent: "Planner",
          tool: "queue_pipeline_run",
          reason: "启动整本写作任务",
          input: {
            startOrder: 1,
            endOrder: intent.targetChapterCount ?? 20,
          },
          keyPrefix: "produce_queue_pipeline",
        },
      );

      return actions;
    },
  },
  {
    id: "query_novel_production_status",
    intent: "query_novel_production_status",
    kind: "single",
    resolve: ({ intent, plannerInput }) => [{
      agent: "Planner",
      tool: "get_novel_production_status",
      reason: "读取整本生产状态",
      input: {
        ...(plannerInput.novelId ? { novelId: plannerInput.novelId } : {}),
        ...(intent.novelTitle ? { title: intent.novelTitle } : {}),
        ...(intent.targetChapterCount ? { targetChapterCount: intent.targetChapterCount } : {}),
      },
      keyPrefix: intent.novelTitle ? `production_status_${intent.novelTitle}` : "production_status",
    }],
  },
];
