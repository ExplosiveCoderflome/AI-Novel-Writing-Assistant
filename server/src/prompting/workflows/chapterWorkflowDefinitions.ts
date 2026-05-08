import type { WorkflowDefinition } from "./workflowTypes";
import { resolveChapterOrder } from "./workflowTypes";

export const chapterWorkflowDefinitions: WorkflowDefinition[] = [
  {
    id: "query_chapter_content",
    intent: "query_chapter_content",
    kind: "single",
    resolve: ({ intent, plannerInput }) => {
      const range = intent.chapterSelectors.range;
      const relativeFirstN = intent.chapterSelectors.relative?.type === "first_n"
        ? intent.chapterSelectors.relative.count
        : null;

      const normalizedOrders = (intent.chapterSelectors.orders ?? [])
        .filter((order) => Number.isFinite(order))
        .map((order) => Math.max(1, Math.trunc(order)))
        .filter((order, index, list) => list.indexOf(order) === index)
        .sort((left, right) => left - right);

      if (normalizedOrders.length > 0) {
        return normalizedOrders.slice(0, 5).map((order) => ({
          agent: "Planner",
          tool: "get_chapter_content_by_order",
          reason: `读取第${order}章正文`,
          input: { novelId: plannerInput.novelId, chapterOrder: order },
          keyPrefix: `chapter_${order}`,
        }));
      }
      if (range) {
        return [{
          agent: "Planner",
          tool: "summarize_chapter_range",
          reason: "按章节范围汇总内容",
          input: { novelId: plannerInput.novelId, startOrder: range.startOrder, endOrder: range.endOrder, mode: "summary" },
          keyPrefix: `chapter_range_${range.startOrder}_${range.endOrder}`,
        }];
      }
      if (relativeFirstN != null) {
        return [{
          agent: "Planner",
          tool: "summarize_chapter_range",
          reason: "按前 N 章汇总内容",
          input: { novelId: plannerInput.novelId, startOrder: 1, endOrder: relativeFirstN, mode: "summary" },
          keyPrefix: `chapter_first_n_${relativeFirstN}`,
        }];
      }
      if (intent.chapterSelectors.chapterId) {
        return [{
          agent: "Planner",
          tool: "get_chapter_content",
          reason: "按章节 ID 读取正文",
          input: { novelId: plannerInput.novelId, chapterId: intent.chapterSelectors.chapterId },
          keyPrefix: "chapter_content_by_id",
        }];
      }
      return [{
        agent: "Planner",
        tool: "get_novel_context",
        reason: "读取小说上下文，辅助定位章节",
        input: { novelId: plannerInput.novelId },
        keyPrefix: "context_for_chapter_query",
      }];
    },
  },
  {
    id: "write_chapter",
    intent: "write_chapter",
    kind: "workflow",
    resolve: ({ intent, plannerInput }) => {
      if (!plannerInput.novelId) {
        return [];
      }
      const range = intent.chapterSelectors.range
        ? {
          startOrder: Math.min(intent.chapterSelectors.range.startOrder, intent.chapterSelectors.range.endOrder),
          endOrder: Math.max(intent.chapterSelectors.range.startOrder, intent.chapterSelectors.range.endOrder),
        }
        : null;
      const normalizedOrders = (intent.chapterSelectors.orders ?? [])
        .filter((order) => Number.isFinite(order))
        .map((order) => Math.max(1, Math.trunc(order)))
        .filter((order, index, list) => list.indexOf(order) === index)
        .sort((left, right) => left - right);
      const resolvedRange = range
        ?? (normalizedOrders.length > 0
          ? { startOrder: normalizedOrders[0], endOrder: normalizedOrders[normalizedOrders.length - 1] }
          : null);
      const startOrder = resolvedRange?.startOrder ?? 1;
      const endOrder = resolvedRange?.endOrder ?? startOrder;
      return [{
        agent: "Planner",
        tool: "preview_pipeline_run",
        reason: "预览写作范围",
        input: { novelId: plannerInput.novelId, startOrder, endOrder },
        keyPrefix: `preview_${startOrder}_${endOrder}`,
      }, {
        agent: "Planner",
        tool: "queue_pipeline_run",
        reason: "创建写作流水线任务",
        input: { novelId: plannerInput.novelId, startOrder, endOrder },
        keyPrefix: `queue_${startOrder}_${endOrder}`,
      }];
    },
  },
  {
    id: "rewrite_chapter",
    intent: "rewrite_chapter",
    kind: "workflow",
    resolve: ({ intent, plannerInput }) => {
      const order = resolveChapterOrder(intent);
      if (plannerInput.novelId && order != null) {
        return [
          {
            agent: "Planner",
            tool: "get_chapter_content_by_order",
            reason: "读取待改写章节正文",
            input: { novelId: plannerInput.novelId, chapterOrder: order },
            keyPrefix: `rewrite_read_${order}`,
          },
          {
            agent: "Planner",
            tool: "preview_pipeline_run",
            reason: `重写第${order}章预览`,
            input: { novelId: plannerInput.novelId, startOrder: order, endOrder: order },
            keyPrefix: `rewrite_preview_${order}`,
          },
          {
            agent: "Planner",
            tool: "queue_pipeline_run",
            reason: `重写第${order}章执行`,
            input: { novelId: plannerInput.novelId, startOrder: order, endOrder: order },
            keyPrefix: `rewrite_queue_${order}`,
          },
        ];
      }
      if (intent.chapterSelectors.chapterId) {
        return [{
          agent: "Planner",
          tool: "get_chapter_content",
          reason: "读取待改写章节正文",
          input: { novelId: plannerInput.novelId, chapterId: intent.chapterSelectors.chapterId },
          keyPrefix: "rewrite_read_by_id",
        }];
      }
      return [];
    },
  },
  {
    id: "save_chapter_draft",
    intent: "save_chapter_draft",
    kind: "workflow",
    resolve: ({ intent, plannerInput }) => {
      const order = resolveChapterOrder(intent);
      if (!plannerInput.novelId || (!intent.chapterSelectors.chapterId && order == null) || !intent.content) {
        return [];
      }
      return [{
        agent: "Writer",
        tool: "save_chapter_draft",
        reason: "保存章节草稿",
        input: intent.chapterSelectors.chapterId
          ? { novelId: plannerInput.novelId, chapterId: intent.chapterSelectors.chapterId, content: intent.content }
          : { novelId: plannerInput.novelId, chapterOrder: order, content: intent.content },
        keyPrefix: "save_draft",
      }];
    },
  },
  {
    id: "start_pipeline",
    intent: "start_pipeline",
    kind: "workflow",
    resolve: ({ intent, plannerInput }) => {
      if (!plannerInput.novelId) {
        return [];
      }
      const range = intent.chapterSelectors.range
        ? {
          startOrder: Math.min(intent.chapterSelectors.range.startOrder, intent.chapterSelectors.range.endOrder),
          endOrder: Math.max(intent.chapterSelectors.range.startOrder, intent.chapterSelectors.range.endOrder),
        }
        : null;
      const normalizedOrders = (intent.chapterSelectors.orders ?? [])
        .filter((order) => Number.isFinite(order))
        .map((order) => Math.max(1, Math.trunc(order)))
        .filter((order, index, list) => list.indexOf(order) === index)
        .sort((left, right) => left - right);
      const resolvedRange = range
        ?? (normalizedOrders.length > 0
          ? { startOrder: normalizedOrders[0], endOrder: normalizedOrders[normalizedOrders.length - 1] }
          : null);
      const startOrder = resolvedRange?.startOrder ?? 1;
      const endOrder = resolvedRange?.endOrder ?? startOrder;
      return [{
        agent: "Planner",
        tool: "preview_pipeline_run",
        reason: "预览写作范围",
        input: { novelId: plannerInput.novelId, startOrder, endOrder },
        keyPrefix: `preview_${startOrder}_${endOrder}`,
      }, {
        agent: "Planner",
        tool: "queue_pipeline_run",
        reason: "创建写作流水线任务",
        input: { novelId: plannerInput.novelId, startOrder, endOrder },
        keyPrefix: `queue_${startOrder}_${endOrder}`,
      }];
    },
  },
];
