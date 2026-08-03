const test = require('node:test');
const assert = require('node:assert/strict');
const { autoWakeSchedulerService } = require('../dist/services/task/AutoWakeSchedulerService.js');

test('Module 2: Quota-Aware Unattended Auto-Wake Scheduler (Default: Unattended)', async (t) => {
  const taskId = `test-task-${Date.now()}`;
  const novelId = `test-novel-${Date.now()}`;

  t.afterEach(() => {
    autoWakeSchedulerService.clearSchedule(taskId);
  });

  await t.test('Default Behavior: Unattended mode is enabled BY DEFAULT without manual config', () => {
    const res = autoWakeSchedulerService.handleQuotaError(taskId, novelId, new Error('429 Rate Limit'));
    assert.equal(res.scheduled, true);
    assert.ok(res.coolDownMs > 0);
    assert.equal(res.retryCount, 1);
    assert.equal(res.record.status, 'COOLING');
  });

  await t.test('Exponential Backoff: Cooldown duration increases with retry count', () => {
    const taskIdExp = `exp-task-${Date.now()}`;
    
    // First retry
    const res1 = autoWakeSchedulerService.handleQuotaError(taskIdExp, novelId, '429 Rate Limit', { enableJitter: false, baseCoolDownMs: 1000 });
    assert.equal(res1.coolDownMs, 1000);

    // Second retry
    const res2 = autoWakeSchedulerService.handleQuotaError(taskIdExp, novelId, '429 Rate Limit', { enableJitter: false, baseCoolDownMs: 1000 });
    assert.equal(res2.coolDownMs, 2000);

    // Third retry
    const res3 = autoWakeSchedulerService.handleQuotaError(taskIdExp, novelId, '429 Rate Limit', { enableJitter: false, baseCoolDownMs: 1000 });
    assert.equal(res3.coolDownMs, 4000);

    autoWakeSchedulerService.clearSchedule(taskIdExp);
  });

  await t.test('Heartbeat Worker: Auto-resumes task when cooldown time elapses', async () => {
    const taskIdHeartbeat = `hb-task-${Date.now()}`;
    let resumedTaskId = null;

    autoWakeSchedulerService.setResumeHandler(async (tId) => {
      resumedTaskId = tId;
    });

    const res = autoWakeSchedulerService.handleQuotaError(taskIdHeartbeat, novelId, 'Quota Exhausted', { baseCoolDownMs: 100, enableJitter: false });
    assert.equal(res.scheduled, true);

    // Fast-forward time past coolDownUntilMs
    const futureTime = res.coolDownUntilMs + 10;
    const resumed = await autoWakeSchedulerService.tickHeartbeat(futureTime);

    assert.equal(resumed.length, 1);
    assert.equal(resumed[0].status, 'RECOVERED');
    assert.equal(resumedTaskId, taskIdHeartbeat);

    autoWakeSchedulerService.clearSchedule(taskIdHeartbeat);
  });

  await t.test('Opt-out Option: Respects explicit enabled = false to switch to manual mode', () => {
    const res = autoWakeSchedulerService.handleQuotaError(taskId, novelId, new Error('429 Rate Limit'), { enabled: false });
    assert.equal(res.scheduled, false);
    assert.equal(autoWakeSchedulerService.getSchedule(taskId), undefined);
  });

  await t.test('Max Retries Exceeded: Falls back to manual mode after maxRetries', () => {
    const taskIdMax = `max-task-${Date.now()}`;
    const config = { maxRetries: 2, baseCoolDownMs: 50, enableJitter: false };

    autoWakeSchedulerService.handleQuotaError(taskIdMax, novelId, 'Err', config); // Retry 1
    autoWakeSchedulerService.handleQuotaError(taskIdMax, novelId, 'Err', config); // Retry 2
    
    // Retry 3 (Exceeds maxRetries 2)
    const resExceeded = autoWakeSchedulerService.handleQuotaError(taskIdMax, novelId, 'Err', config);
    assert.equal(resExceeded.scheduled, false);

    const record = autoWakeSchedulerService.getSchedule(taskIdMax);
    assert.equal(record.status, 'EXHAUSTED_MAX_RETRIES');

    autoWakeSchedulerService.clearSchedule(taskIdMax);
  });
});
