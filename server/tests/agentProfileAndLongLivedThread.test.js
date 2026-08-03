const test = require('node:test');
const assert = require('node:assert/strict');
const { agentProfileRegistry } = require('../dist/platform/agent/AgentProfileRegistry.js');
const { longLivedThreadService } = require('../dist/platform/agent/LongLivedThreadService.js');

test('Phase 1 & 2: Digital Employee Profile & Long-Lived Thread Architecture', async (t) => {
  const workspaceId = `test-workspace-${Date.now()}`;

  await t.test('Phase 1: AgentProfileRegistry returns standardized profiles with Identity, Domain & Scope', () => {
    const directorProfile = agentProfileRegistry.getProfile('novel-director');
    assert.equal(directorProfile.identity.displayName, 'AI 创作总监');
    assert.equal(directorProfile.scope.riskTier, 'MEDIUM');
    assert.ok(directorProfile.domain.primaryCapability.includes('全书架构规划'));

    const auditorProfile = agentProfileRegistry.getProfile('style-auditor');
    assert.equal(auditorProfile.identity.role, 'style-auditor');
    assert.equal(auditorProfile.scope.riskTier, 'LOW');
  });

  await t.test('Phase 2: LongLivedThreadService maintains static prompt head to maximize Prompt Cache hits', () => {
    const thread = longLivedThreadService.getOrCreateThread(workspaceId, 'novel-director');
    assert.ok(thread.staticPromptHead.includes('=== [DIGITAL EMPLOYEE: AI 创作总监] ==='));
    assert.ok(thread.staticPromptHead.includes('ROLE: novel-director'));

    const messages = longLivedThreadService.assembleThreadContext(workspaceId, 'novel-director', '写第一章提要');
    assert.equal(messages[0].role, 'system');
    assert.ok(messages[0].content.includes('AI 创作总监'));
    assert.equal(messages[1].role, 'user');
    assert.equal(messages[1].content, '写第一章提要');
  });

  await t.test('Phase 2: LongLivedThreadService inherits thread history and compresses warm memory digest', () => {
    // Append 5 round trips (10 messages) with user preferences
    for (let i = 1; i <= 5; i++) {
      longLivedThreadService.appendResponse(
        workspaceId,
        'style-auditor',
        `第 ${i} 次修正：偏好简洁排版和阴郁情绪`,
        `助手确认：已记录第 ${i} 次排版偏好`
      );
    }

    const messages = longLivedThreadService.assembleThreadContext(
      workspaceId,
      'style-auditor',
      '请生成新章节'
    );

    // Verify compaction digest has been generated and retained
    const threadState = longLivedThreadService.getThreadState(workspaceId, 'style-auditor');
    assert.ok(threadState.workingMemoryDigest.includes('User Feedback: 第 1 次修正：偏好简洁排版和阴郁情绪'));
    assert.ok(messages[0].content.includes('WORKING MEMORY DIGEST & USER PREFERENCES'));
  });
});
