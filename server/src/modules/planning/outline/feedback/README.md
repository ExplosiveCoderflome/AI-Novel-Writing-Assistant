# Outline feedback boundary

- `domain/feedbackPolicy.ts`: deterministic frequency and policy-authorized context selection.
- `application/OutlineFeedbackService.ts`: summary-only snapshots, durable run state, async invocation, transactional per-item decisions and future chapter synchronization.
- `http/feedbackRoutes.ts`: validated API mapping, mounted under existing outline routes.
- `index.ts`: service facade for summary writers. Pass only novelId/chapterId to `notify`.

Use the existing outline proposal/revision repository and A2 mapping/policy. Do not call director orchestration, read chapter prose, rewrite source revisions, or introduce a generation gate. Runtime/recovery and route contracts: [章节摘要反馈工作大纲](../../../../../../../docs/wiki/workflows/outline-text-feedback.md).
