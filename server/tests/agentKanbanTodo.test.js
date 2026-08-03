const test = require('node:test');
const assert = require('node:assert/strict');
const { agentKanbanTodoService } = require('../dist/services/task/AgentKanbanTodoService.js');

test('Module 3: Durable Agent Executable Todos Kanban Architecture', async (t) => {
  const novelId = `novel-kanban-${Date.now()}`;
  const directorTaskId = `task-director-${Date.now()}`;

  t.afterEach(() => {
    agentKanbanTodoService.clearBoard(novelId);
  });

  await t.test('Kanban Board Initialization: Creates ordered atomic todo nodes', () => {
    const rawTodos = [
      { title: '大纲方向规划', agentRole: 'novel-director', stageId: 'candidates' },
      { title: '角色矩阵搭建', agentRole: 'novel-director', stageId: 'story_macro' },
      { title: '第 1 章正文执笔', agentRole: 'novel-director', stageId: 'chapter_execution', chapterIndex: 1 },
      { title: '第 1 章文风审校', agentRole: 'style-auditor', stageId: 'chapter_execution', chapterIndex: 1 },
    ];

    const records = agentKanbanTodoService.initializeKanbanBoard(novelId, directorTaskId, rawTodos);
    assert.equal(records.length, 4);
    assert.equal(records[0].orderIndex, 1);
    assert.equal(records[0].status, 'PENDING');
    assert.equal(records[3].chapterIndex, 1);
  });

  await t.test('Atomic Claiming: Specialized agents claim unassigned pending todos without race conditions', () => {
    const rawTodos = [
      { title: '第 1 章正文执笔', agentRole: 'novel-director', stageId: 'chapter_execution' },
      { title: '第 1 章文风审校', agentRole: 'style-auditor', stageId: 'chapter_execution' },
    ];
    agentKanbanTodoService.initializeKanbanBoard(novelId, directorTaskId, rawTodos);

    // Novel Director Claims first
    const claimResult1 = agentKanbanTodoService.claimNextTodo(novelId, 'novel-director', 'worker-director-1');
    assert.equal(claimResult1.claimed, true);
    assert.equal(claimResult1.todo.title, '第 1 章正文执笔');
    assert.equal(claimResult1.todo.status, 'CLAIMED');

    // Trying to claim again yields Style Auditor todo for Auditor worker
    const claimResult2 = agentKanbanTodoService.claimNextTodo(novelId, 'style-auditor', 'worker-auditor-1');
    assert.equal(claimResult2.claimed, true);
    assert.equal(claimResult2.todo.title, '第 1 章文风审校');

    // No pending left
    const claimResult3 = agentKanbanTodoService.claimNextTodo(novelId, 'novel-director', 'worker-director-1');
    assert.equal(claimResult3.claimed, false);
  });

  await t.test('Evidence Completion: Completes todo and attaches Module 1 evidence certificate', () => {
    agentKanbanTodoService.initializeKanbanBoard(novelId, directorTaskId, [
      { title: '第 1 章正文执笔', agentRole: 'novel-director', stageId: 'chapter_execution' },
    ]);

    const { todo } = agentKanbanTodoService.claimNextTodo(novelId, 'novel-director', 'worker-1');
    const mockEvidence = { certificateId: 'cert-123', valueScore: 0.92, signature: 'sha256-sig' };

    const success = agentKanbanTodoService.completeTodo(todo.id, mockEvidence);
    assert.equal(success, true);

    const summary = agentKanbanTodoService.getBoardSummary(novelId);
    assert.equal(summary.completed, 1);
    assert.equal(summary.pending, 0);
    assert.ok(summary.todos[0].evidencePayload.includes('sha256-sig'));
  });

  await t.test('Crash Deadlock Recovery: Resets stale CLAIMED todo back to PENDING', () => {
    agentKanbanTodoService.initializeKanbanBoard(novelId, directorTaskId, [
      { title: '第 2 章正文执笔', agentRole: 'novel-director', stageId: 'chapter_execution' },
    ]);

    const { todo } = agentKanbanTodoService.claimNextTodo(novelId, 'novel-director', 'worker-crashed');
    assert.equal(todo.status, 'CLAIMED');

    // Simulate worker crash by faking claimedAtMs 10 minutes ago
    todo.claimedAtMs = Date.now() - 600000;

    const recoveredCount = agentKanbanTodoService.recoverStaleClaimedTodos(300000); // 5 min timeout
    assert.equal(recoveredCount, 1);
    assert.equal(todo.status, 'PENDING');
    assert.equal(todo.claimedByWorker, undefined);

    // Worker 2 can now claim it
    const claimResultRetry = agentKanbanTodoService.claimNextTodo(novelId, 'novel-director', 'worker-2');
    assert.equal(claimResultRetry.claimed, true);
    assert.equal(claimResultRetry.todo.claimedByWorker, 'worker-2');
  });
});
