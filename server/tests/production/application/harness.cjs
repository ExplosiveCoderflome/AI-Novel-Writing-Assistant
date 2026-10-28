const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const domain = require('../domain/fixtures.cjs');
const appPath = path.resolve(__dirname, '../../../dist/modules/production/application/index.js');
const app = fs.existsSync(appPath) ? require(appPath) : {};
const hash = content => crypto.createHash('sha256').update(content).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
function request(overrides = {}) {
  return {
    ownerKey: 'job-1', unit: { novelId: 'novel-1', chapterId: 'chapter-1', order: 1 },
    profile: { id: 'long-standard', stages: ['prepare', 'draft', 'accept', 'repair', 'verify', 'select', 'commit', 'reconcile'],
      repair: { maxAttempts: 1, mode: 'light_repair' }, context: 'long', reconcile: 'adaptive', outputBudgets: { draft: 6000, accept: 4096, repair: 6000, verify: 6144 }, capabilities: [] },
    policy: { blockingAction: 'continue_with_warning' },
    policySource: { maxAutomaticRetries: 1, issueActions: { 'quality.obligation_gap': 'continue_with_warning' } },
    model: { provider: 'test', model: 'fake-model', promptVersion: 'v1', configVersion: 'v1', inputFingerprint: 'input-v1' },
    ...overrides,
  };
}
function verdict(content, extra = {}) {
  return { contentHash: hash(content), gateAvailable: true, issues: [], missingObligations: [], replan: 'none', ...extra };
}
function harness(options = {}) {
  const calls = []; const reservations = []; const rows = new Map();
  let nextId = 0;
  const store = {
    async loadOrCreate(req) {
      const key = `${req.ownerKey}:${req.unit.chapterId}`;
      let row = rows.get(key);
      if (!row) {
        row = { id: `run-${++nextId}`, ownerKey: req.ownerKey, version: 1,
          snapshots: { profile: copy(req.profile), policy: copy(req.policy), model: copy(req.model), policySource: copy(req.policySource) },
          progress: { unit: copy(req.unit), completed: [], repairAttemptsUsed: 0 }, artifacts: { receipts: {} }, activeStage: null, activeRequestKey: null };
        rows.set(key, copy(row));
      }
      return copy(row);
    },
    async compareAndSwap(row, next, chapterWrite) {
      if (options.beforeSave) await options.beforeSave(row, next);
      const key = `${row.ownerKey}:${row.progress.unit.chapterId}`;
      const actual = rows.get(key);
      if (actual.version !== row.version) return null;
      const saved = { ...copy(row), ...copy(next), version: row.version + 1 };
      if (chapterWrite) calls.push('chapter-write');
      rows.set(key, saved);
      if (options.afterSave) await options.afterSave(saved);
      return copy(saved);
    },
  };
  const stages = {};
  for (const stage of ['prepare', 'draft', 'accept', 'repair', 'verify', 'commit', 'reconcile']) {
    stages[stage] = {
      describe: async row => ({ callsModel: ['draft', 'accept', 'repair', 'verify'].includes(stage),
        inputFingerprint: `${stage}:${row.artifacts.original || ''}:${row.artifacts.candidate || ''}`, promptVersion: 'v1', configVersion: 'v1' }),
      execute: async (row, invocation) => {
        calls.push(stage);
        if (options.execute) {
          const response = await options.execute(stage, row, invocation);
          if (response) return response;
        }
        if (stage === 'prepare') return { result: { stage } };
        if (stage === 'draft') return { result: { stage, contentHash: hash('original') }, artifacts: { original: 'original' } };
        if (stage === 'accept') return { result: { stage, verdict: verdict(row.artifacts.original, options.originalVerdict) } };
        if (stage === 'repair') return { result: { stage, outcome: 'candidate', contentHash: hash('candidate') }, artifacts: { candidate: 'candidate' } };
        if (stage === 'verify') return { result: { stage, verdict: verdict(row.artifacts.candidate, { factPreservation: 'preserved', ...options.candidateVerdict }) } };
        if (stage === 'commit') return { result: { stage, contentHash: row.progress.selectedContentHash } };
        return { result: { stage, status: 'completed' } };
      },
      recover: options.recover ? (row, key) => options.recover(stage, row, key) : undefined,
    };
  }
  return { calls, reservations, rows, store, stages,
    fence: async (row, point) => { if (options.fence) await options.fence(row, point); },
    budget: { reserve: async input => { reservations.push(copy(input)); return { accepted: !options.denyBudget, reservationKey: input.requestKey }; } },
  };
}
function api(name) { assert.equal(typeof app[name], 'function', `${name} must be exported`); return app[name]; }
module.exports = { api, request, harness, hash, verdict, copy };
