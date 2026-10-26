const test = require('node:test'), assert = require('node:assert/strict');
const {DirectorWorker: CoreWorker} = require('../../../dist/modules/director/application/worker');
const {executionSignal, assertExecutionActive} = require('../../../dist/platform/runtime/execution');
const {withExecutionSignal} = require('../../../dist/platform/runtime/execution');
class DirectorWorker extends CoreWorker {
  constructor(options) {super({executionScope:withExecutionSignal,...options});}
}
const {attachExecutionSignal} = require('../../../dist/platform/llm/execution');
let keepAlive;
test.before(() => {keepAlive = setInterval(() => {}, 1000);});
test.after(() => clearInterval(keepAlive));
const runtime = {nextId: require('node:crypto').randomUUID, now: () => new Date(), workerId: () => 'worker', leaseExpiresAt: now => new Date(now.getTime()+1000)};
const repo = overrides => ({listLeaseCandidates: async () => ['book'], acquireLease: async () => true,
  heartbeat: async () => true, releaseLease: async () => {}, ...overrides});
const abortedModel = () => attachExecutionSignal({invoke: async (_input, {signal}) => new Promise((resolve, reject) => {
  signal.addEventListener('abort', () => reject(signal.reason), {once: true});
}), stream: async () => {throw Error('unexpected stream');}});

test('the step executor receives the exact acquired lease identity for transactional writes', async () => {
  let leaseOwner, execution;
  const worker = new DirectorWorker({runtime: {...runtime, nextId: () => 'attempt-1'},
    runRepository: repo({acquireLease: async (_id, owner) => {leaseOwner = owner; return true;}}),
    executor: {runOnce: async (_id, value) => {execution = value;}}});
  await worker.tick();
  assert.deepEqual(execution, {leaseOwner: 'worker:attempt-1'});
  assert.equal(execution.leaseOwner, leaseOwner);
});

test('polling survives an infrastructure error and duplicate starts share one loop', {timeout: 2000}, async () => {
  let polls = 0, errors = 0, runs = 0;
  const worker = new DirectorWorker({runtime, pollMs: 1, onError: () => errors++,
    runRepository: repo({listLeaseCandidates: async () => {if (++polls === 1) throw Error('database busy');return ['new-book'];}}),
    executor: {runOnce: async () => {runs++; worker.stop();}}});
  const first = worker.start(); assert.equal(worker.start(), first);
  await first;
  assert.equal(errors, 1); assert.equal(runs, 1); assert.equal(polls, 2);
});

for (const failedAt of ['ownership', 'lease']) {
  test(`${failedAt} errors on one candidate do not starve the next book`, async () => {
    const ran = [];
    const worker = new DirectorWorker({runtime, onError: () => {}, canExecute: async id => {
      if (failedAt === 'ownership' && id === 'bad') throw Error('failed owner read');return true;
    }, runRepository: repo({listLeaseCandidates: async () => ['bad','good'], acquireLease: async id => {
      if (failedAt === 'lease' && id === 'bad') throw Error('lease write failed');return true;
    }}), executor: {runOnce: async id => ran.push(id)}});
    assert.equal(await worker.tick(), true); assert.deepEqual(ran, ['good']);
  });
}

for (const failure of ['record', 'release']) {
  test(`${failure} failure does not kill dispatch for the next book`, {timeout: 2000}, async () => {
    let turns = 0, errors = 0;
    const worker = new DirectorWorker({runtime, pollMs: 1, onError: () => errors++,
      runRepository: repo({listLeaseCandidates: async () => ++turns === 1 ? ['old'] : ['new'],
        getControl: async () => ({status: 'running', version: 0}), getContract: async () => ({issuePolicy: {}}),
        releaseLease: async id => {if (failure === 'release' && id === 'old') throw Error('release failed');}}),
      eventLog: {list: async () => [], append: async () => {throw Error('event write failed');}}, recoveryPolicy: {maxAttempts: () => 1},
      executor: {runOnce: async id => {if (id === 'old' && failure === 'record') throw Error('step failed'); if (id === 'new') worker.stop();}}});
    await worker.start(); assert.equal(errors, 1); assert.equal(turns, 2);
  });
}

for (const outcome of ['lost', 'reject']) {
  test(`renewal ${outcome} aborts the model, fences old execution and does not create an unhandled rejection`, {timeout: 2000}, async () => {
    let afterModel = false, errors = 0;
    const worker = new DirectorWorker({runtime, heartbeatMs: 3, onError: () => errors++,
      runRepository: repo({heartbeat: async () => {if (outcome === 'reject') throw Error('busy');return false;}}),
      executor: {runOnce: async () => {await abortedModel().invoke('write'); afterModel = true;}}});
    assert.equal(await worker.tick(), false);
    assert.equal(afterModel, false); assert.equal(errors, 1);
  });
}

test('an uncooperative model cannot commit a result after its scope is revoked', {timeout: 2000}, async () => {
  let stored = false;
  const model = attachExecutionSignal({invoke: async () => {await new Promise(r => setTimeout(r,20));return 'late';}, stream: async () => {}});
  const worker = new DirectorWorker({runtime, heartbeatMs: 2, onError: () => {}, runRepository: repo({heartbeat: async () => false}),
    executor: {runOnce: async () => {await model.invoke('write');stored = true;}}});
  assert.equal(await worker.tick(), false); assert.equal(stored, false);
});

test('expiry cancels an execution even when its renewal never settles', {timeout: 2000}, async () => {
  const worker = new DirectorWorker({runtime: {...runtime, leaseExpiresAt: n => new Date(n.getTime()+25)}, heartbeatMs: 1,
    onError: () => {}, runRepository: repo({heartbeat: async () => new Promise(() => {})}), executor: {runOnce: async () => abortedModel().invoke('write')}});
  assert.equal(await worker.tick(), false);
});

test('a finished step releases its lease and revokes its scope without waiting for a stuck renewal', {timeout: 2000}, async () => {
  let entered, settle, signal, releases = 0;
  const renewing = new Promise(r => {entered = r;});
  const renewal = new Promise(r => {settle = r;});
  const worker = new DirectorWorker({runtime: {...runtime, leaseExpiresAt: n => new Date(n.getTime()+40)}, heartbeatMs: 1,
    onError: () => {}, runRepository: repo({heartbeat: async () => {entered();return renewal;}, releaseLease: async () => releases++}),
    executor: {runOnce: async () => {signal = executionSignal();await renewing;}}});
  const tick = worker.tick();
  let timer;
  try {
    assert.equal(await Promise.race([tick, new Promise(r => {timer = setTimeout(() => r('stuck'), 150);})]), true);
    assert.equal(releases, 1); assert.equal(signal.aborted, true);
  } finally {
    clearTimeout(timer);settle(false);await tick;
  }
  assert.equal(worker.getHealth().state, 'idle');
});

test('renewal is serialized and each execution receives a distinct lease owner', {timeout: 2000}, async () => {
  let peak = 0; const owners = [], inFlight = new Map();
  const worker = new DirectorWorker({runtime, heartbeatMs: 1, runRepository: repo({acquireLease: async (_id, owner) => {owners.push(owner);return true;},
    heartbeat: async (_id, owner) => {const count = (inFlight.get(owner) ?? 0) + 1;inFlight.set(owner, count);peak = Math.max(peak, count);
      await new Promise(r => setTimeout(r,5));inFlight.set(owner, count-1);return true;}}),
    executor: {runOnce: async () => new Promise(r => setTimeout(r,22))}});
  await worker.tick(); await worker.tick();
  assert.equal(peak, 1); assert.notEqual(owners[0], owners[1]);
});

test('stop cancels in-flight work and wake cannot revive a stopped service', {timeout: 2000}, async () => {
  let entered;
  const started = new Promise(r => {entered = r;});
  const worker = new DirectorWorker({runtime, runRepository: repo(), onError: () => {}, executor: {runOnce: async () => {
    const signal = executionSignal();
    entered();await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once: true}));
    assertExecutionActive();
  }}});
  const loop = worker.start(); await started; worker.stop(); await loop;
  worker.wake(); assert.equal(worker.getHealth().state, 'stopped');
});

test('stop during lease acquisition prevents late execution and releases the acquired owner', {timeout: 2000}, async () => {
  let entered, acquired, runs = 0, releases = 0;
  const claiming = new Promise(r => {entered = r;});
  const claim = new Promise(r => {acquired = r;});
  const worker = new DirectorWorker({runtime, runRepository: repo({acquireLease: async () => {entered();return claim;},
    releaseLease: async () => releases++}), executor: {runOnce: async () => runs++}});
  const loop = worker.start();await claiming;worker.stop();acquired(true);await loop;
  assert.equal(runs, 0);assert.equal(releases, 1);assert.equal(worker.getHealth().state, 'stopped');
});

test('an acquisition returned after its deadline cannot start business execution', async () => {
  let clock = 0, runs = 0, errors = 0, releases = 0;
  const worker = new DirectorWorker({runtime: {...runtime, now: () => new Date(clock), leaseExpiresAt: n => new Date(n.getTime()+10)},
    onError: () => errors++, runRepository: repo({acquireLease: async () => {clock = 20;return true;}, releaseLease: async () => releases++}),
    executor: {runOnce: async () => runs++}});
  assert.equal(await worker.tick(), false);assert.equal(runs, 0);assert.equal(errors, 1);assert.equal(releases, 1);
});

test('execution cancellation removes an invoke waiting for a model permit without a second request', async () => {
  const {attachLLMRequestLimiter} = require('../../../dist/llm/requestLimiter');
  let release, entered, requests = 0;
  const ready = new Promise(r => {entered = r;});
  const pending = new Promise(r => {release = r;});
  const model = attachExecutionSignal(attachLLMRequestLimiter({invoke: async () => {requests++;entered();await pending;return 'done';},
    stream: async () => {}}, {provider:'test',model:'worker-cancel',concurrencyLimit:1,requestIntervalMs:0}));
  const first = model.invoke('first');await ready;
  const controller = new AbortController();
  const second = withExecutionSignal(controller.signal,()=>model.invoke('second'));
  controller.abort(Error('execution ended'));
  await assert.rejects(second,/execution ended/);release();await first;
  assert.equal(requests,1);
});
