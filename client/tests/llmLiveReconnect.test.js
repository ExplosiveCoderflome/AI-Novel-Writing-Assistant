import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const settle = () => new Promise(resolve => setImmediate(resolve));
const snapshot = (preview, seq = 1) => ({ type: 'snapshot', sessions: [{
  context: { interactionId: 'call-1', label: '正文', mode: 'text' },
  seq, phase: 'streaming', preview, reasoning: '', totalChars: preview.length,
  totalReasoningChars: 0, startedAt: '2026-10-05T00:00:00Z', updatedAt: '2026-10-05T00:00:01Z',
}] });

function harness(initialFetchMode = 'stream') {
  let now = 0;
  let nextTimer = 0;
  const timers = new Map();
  const setTimer = (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, at: now + delay }); return id; };
  const clearTimer = id => timers.delete(id);
  const tick = ms => {
    const end = now + ms;
    while (true) {
      const pending = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!pending) break;
      now = pending[1].at;
      timers.delete(pending[0]);
      pending[1].callback();
    }
    now = end;
  };
  const windowTarget = new EventTarget();
  windowTarget.setTimeout = setTimer;
  windowTarget.clearTimeout = clearTimer;
  const documentTarget = new EventTarget();
  documentTarget.visibilityState = 'visible';
  const requests = [];
  const states = [];
  const effects = [];
  let fetchMode = initialFetchMode;
  const fetchStream = async (url, { signal }) => {
    const request = { url, signal, cancelled: false };
    requests.push(request);
    if (fetchMode === 'pending') return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
    if (fetchMode === 'late-response') return new Promise(resolve => {
      signal.addEventListener('abort', () => resolve({ ok: true, body: new ReadableStream() }), { once: true });
    });
    const body = new ReadableStream({
      start(controller) {
        request.send = (frame, lineEnding = '\n') => controller.enqueue(new TextEncoder().encode(
          `event: llm_live${lineEnding}data: ${JSON.stringify(frame)}${lineEnding}${lineEnding}`,
        ));
        request.end = () => controller.close();
        request.fail = () => controller.error(new Error('network lost'));
      },
      cancel() { request.cancelled = true; },
    });
    signal.addEventListener('abort', () => { request.cancelled = true; }, { once: true });
    return { ok: true, body };
  };
  const modules = new Map();
  const load = relative => {
    if (modules.has(relative)) return modules.get(relative);
    const sourcePath = fileURLToPath(new URL(`../src/${relative}.ts`, import.meta.url));
    const source = ts.transpileModule(readFileSync(sourcePath, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: sourcePath,
    }).outputText;
    const exports = {};
    const imports = {
      react: {
        useEffect: fn => effects.push(fn), useMemo: fn => fn(), useRef: value => ({ current: value }),
        useState: value => {
          const index = states.push(value) - 1;
          return [value, update => { states[index] = typeof update === 'function' ? update(states[index]) : update; }];
        },
      },
      '@/lib/constants': { API_BASE_URL: '/api' },
      '@/lib/storage/llmLiveCache': {
        llmLiveCacheKey: taskId => `scope:${taskId || 'global'}`, loadLlmLiveCache: async () => [],
        clearLlmLiveCache: async () => {}, saveLlmLiveCache: async () => {},
      },
    };
    vm.runInThisContext(`(function(require,exports,fetch,window,document,setTimeout,clearTimeout){${source}\n})`, { filename: sourcePath })(
      id => {
        if (id in imports) return imports[id];
        if (id.startsWith('@/lib/llmLive/')) return load(id.slice(2));
        throw new Error(`Unexpected dependency: ${id}`);
      }, exports, fetchStream, windowTarget, documentTarget, setTimer, clearTimer,
    );
    modules.set(relative, exports);
    return exports;
  };
  const hook = load('hooks/useLlmLiveFeed');
  hook.useLlmLiveFeed({ taskId: 'task-1', enabled: true });
  const dispose = effects[0]();
  return {
    requests, states, tick, windowTarget, documentTarget, dispose, timers,
    setFetchMode: mode => { fetchMode = mode; },
  };
}

test('a silently stalled live stream reconnects and restores the latest snapshot', async t => {
  const h = harness(); t.after(h.dispose);
  await settle(); h.requests[0].send(snapshot('旧片段'));
  await settle(); h.tick(80);
  assert.equal(h.states[0]['call-1'].preview, '旧片段');
  h.tick(45_000); await settle(); h.tick(2_000); await settle();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[0].signal.aborted, true);
  h.requests[1].send(snapshot('包含断线期间的完整片段', 3));
  await settle(); h.tick(80);
  assert.equal(h.states[0]['call-1'].preview, '包含断线期间的完整片段');
  assert.equal(h.requests[1].url, '/api/llm-live/stream?taskId=task-1');
});

test('service EOF and network errors both retry without user actions', async t => {
  for (const end of ['end', 'fail']) {
    const h = harness(); t.after(h.dispose);
    await settle(); h.requests[0][end]();
    await settle(); h.tick(2_000); await settle();
    assert.equal(h.requests.length, 2);
    h.dispose();
  }
});

test('returning online interrupts reconnect delay without parallel subscriptions', async t => {
  const h = harness(); t.after(h.dispose);
  await settle(); h.requests[0].fail(); await settle();
  h.windowTarget.dispatchEvent(new Event('online'));
  h.windowTarget.dispatchEvent(new Event('online'));
  await settle();
  assert.equal(h.requests.length, 2);
  h.tick(2_000); await settle();
  assert.equal(h.requests.length, 2);
});

test('returning to the visible page refreshes a stale stream immediately', async t => {
  const h = harness(); t.after(h.dispose);
  await settle();
  h.documentTarget.visibilityState = 'hidden';
  h.documentTarget.dispatchEvent(new Event('visibilitychange')); await settle();
  assert.equal(h.requests.length, 1);
  h.documentTarget.visibilityState = 'visible';
  h.documentTarget.dispatchEvent(new Event('visibilitychange')); await settle();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[0].cancelled, true);
});

test('heartbeat frames keep an idle but healthy connection alive', async t => {
  const h = harness(); t.after(h.dispose);
  await settle();
  for (let count = 0; count < 6; count++) {
    h.tick(15_000); h.requests[0].send({ type: 'ping' }); await settle();
  }
  assert.equal(h.requests.length, 1);
});

test('closing a subscription clears retry timers and prevents event-driven reconnects', async () => {
  const h = harness();
  await settle(); h.requests[0].fail(); await settle();
  h.dispose(); await settle();
  assert.equal(h.timers.size, 0);
  h.windowTarget.dispatchEvent(new Event('online'));
  h.documentTarget.dispatchEvent(new Event('visibilitychange'));
  h.tick(100_000); await settle();
  assert.equal(h.requests.length, 1);
});

test('SSE with CRLF line endings still delivers snapshots', async t => {
  const h = harness(); t.after(h.dispose);
  await settle(); h.requests[0].send(snapshot('完整输出'), '\r\n');
  await settle(); h.tick(80);
  assert.equal(h.states[0]['call-1']?.preview, '完整输出');
});

test('a stalled header request is timed out and retried', async t => {
  const h = harness('pending'); t.after(h.dispose);
  await settle(); h.tick(45_000); await settle();
  h.setFetchMode('stream'); h.tick(2_000); await settle();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[0].signal.aborted, true);
});

test('a response arriving after abort cannot terminate the reconnect loop', async t => {
  const h = harness('late-response'); t.after(h.dispose);
  await settle(); h.tick(45_000); await settle();
  h.setFetchMode('stream'); h.tick(2_000); await settle();
  assert.equal(h.requests.length, 2);
});
