const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const assert = require('node:assert/strict');
const test = require('node:test');
const repo = path.resolve(__dirname, '../..');
const fromRepo = createRequire(path.join(repo, 'package.json'));
const fromServer = createRequire(path.join(repo, 'server/package.json'));
const ts = fromRepo('typescript');
const zod = fromServer('zod');
// Exercise the real route, graph, and page handlers with in-memory adapters.
// Reject every unlisted import so these regressions cannot use a database or paid model.
function load(relative, mocks = {}, globals = {}) {
  const filename = path.join(repo, relative);
  const source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText;
  const module = { exports: {} };
  const sandbox = { module, exports: module.exports, console, Error, Date, TextDecoder, URLSearchParams, setInterval, clearInterval, ...globals };
  sandbox.require = name => {
    if (Object.prototype.hasOwnProperty.call(mocks, name)) return mocks[name];
    if (name === 'zod') return zod;
    if (name === 'node:crypto') return require(name);
    throw new Error('Unapproved diagnostic import blocked: ' + name);
  };
  vm.runInNewContext(js, sandbox, { filename });
  return module.exports;
}
const provider = load('server/src/llm/providerSchema.ts');
const validation = load('server/src/middleware/validate.ts');
const errors = load('server/src/middleware/errorHandler.ts');
const helpers = load('server/src/creativeHub/creativeHubRuntimeHelpers.ts');
const routeRegistrations = [];
const routeGraph = { runThread: async () => {} };
const routeService = { getThreadState: async () => ({ currentCheckpointId: null, messages: [] }) };
const router = { use() {}, get() {}, patch() {}, delete() {}, post(route, ...handlers) { routeRegistrations.push({ route, handlers }); } };
load('server/src/routes/creativeHub.ts', {
  express: { Router: () => router },
  '../creativeHub/CreativeHubLangGraph': { creativeHubLangGraph: routeGraph },
  '../creativeHub/CreativeHubInterruptLangGraph': { creativeHubInterruptLangGraph: {} },
  '../llm/providerSchema': provider,
  '../creativeHub/creativeHubRuntimeHelpers': helpers,
  '../middleware/auth': { authMiddleware: (_, __, next) => next() },
  '../middleware/validate': validation,
  '../creativeHub/CreativeHubService': { creativeHubService: routeService },
}, { setInterval: () => 1, clearInterval() {} });
const streamValidator = routeRegistrations.find(x => x.route.endsWith('/runs/stream')).handlers[0];
let storedSelection;
const selection = load('server/src/services/settings/LLMSelectionSettingsService.ts', {
  '../../db/prisma': { prisma: { appSetting: { upsert: async input => { storedSelection = input.create.value; }, findUnique: async () => ({ value: storedSelection }) } } },
});
function validateRequest(payload) {
  const req = { body: payload, params: { threadId: 'diagnostic-thread' }, method: 'POST', originalUrl: '/api/creative-hub/threads/diagnostic-thread/runs/stream' };
  const res = { locals: {}, statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
  streamValidator(req, res, error => { if (error) errors.errorHandler(error, req, res, () => {}); });
  return res;
}
let capturedRequests = [];
const clientApi = load('client/src/api/creativeHub.ts', {
  '@/lib/constants': { API_BASE_URL: '/api' },
  './client': { apiClient: {} },
}, {
  fetch: async (_, request) => {
    const payload = JSON.parse(request.body);
    capturedRequests.push(payload);
    const result = validateRequest(payload);
    if (result.statusCode !== 200) return new Response(JSON.stringify(result.body), { status: result.statusCode, headers: { 'Content-Type': 'application/json' } });
    return new Response('event: messages/complete\ndata: []\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  },
});
async function send(content, maxTokens) {
  const frames = [];
  for await (const frame of clientApi.streamCreativeHubRun('diagnostic-thread', { messages: [{ type: 'human', content }], provider: 'deepseek', model: 'diagnostic-model', temperature: 0.7, maxTokens })) frames.push(frame);
  return frames;
}
test('Creative Hub accepts the full global output range for every prompt', async () => {
  const saved = await selection.saveLLMSelectionSettings({ provider: 'deepseek', model: 'diagnostic-model', maxTokens: 32768 });
  assert.equal(saved.maxTokens, 32768);
  assert.equal((await selection.getLLMSelectionSettings()).maxTokens, 32768);
  for (const prompt of ['你好', '查看小说状态', '为什么失败']) assert.equal((await send(prompt, saved.maxTokens)).length, 1);
  const result = validateRequest(capturedRequests.at(-1));
  assert.equal(result.statusCode, 200);

});
test('Default and boundary maxTokens send normally through the same source code', async () => {
  assert.equal((await send('你好', undefined)).length, 1);
  assert.equal((await send('你好', 16384)).length, 1);
  assert.equal(validateRequest({ messages: [{ type: 'human', content: '你好' }], provider: '' }).statusCode, 400);
});
test('Streaming client preserves actionable validation reasons and status', async () => {
  const result = validateRequest({ messages: [], provider: 'deepseek', maxTokens: 32769 });
  assert.match(result.body.message, /maxTokens/);
  await assert.rejects(send('你好', 32769), error => /maxTokens/.test(error.message) && error.status === 400);
});
test('Blank model selection is omitted so the configured model route can resolve it', async () => {
  for await (const _frame of clientApi.streamCreativeHubRun('diagnostic-thread', { messages: [], provider: '', model: '  ' })) {}
  assert.equal(Object.hasOwn(capturedRequests.at(-1), 'provider'), false);
  assert.equal(Object.hasOwn(capturedRequests.at(-1), 'model'), false);
});
test('Stream error frames expose the concrete error even before an AI message exists', () => {
  const filename = path.join(repo, 'client/src/pages/creativeHub/hooks/useCreativeHubRuntime.ts');
  const source = fs.readFileSync(filename, 'utf8');
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  let handler;
  function find(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'onError') handler = node.initializer.getText(ast);
    ts.forEachChild(node, find);
  }
  find(ast);
  const messages = [];
  const callback = compileExpression(handler, { toast: { error: message => messages.push(message) }, setInterrupt() {} });
  callback({ message: '模型服务连接失败，请检查连接地址。' });
  assert.equal(messages[0], '模型服务连接失败，请检查连接地址。');
});
test('Thread preflight failures are forwarded before streaming headers or heartbeat start', async () => {
  const original = routeService.getThreadState;
  routeService.getThreadState = async () => { throw new Error('thread unavailable'); };
  let flushed = false;
  let forwarded;
  const closeListeners = [];
  const res = { setHeader() {}, flushHeaders() { flushed = true; }, write() {}, on(name, callback) { if (name === 'close') closeListeners.push(callback); } };
  try {
    await routeRegistrations.find(x => x.route.endsWith('/runs/stream')).handlers[1]({ params: { threadId: 't' }, body: { messages: [] } }, res, error => { forwarded = error; });
    assert.match(forwarded.message, /thread unavailable/);
    assert.equal(flushed, false);
    assert.equal(closeListeners.length, 0);
  } finally {
    closeListeners.forEach(callback => callback());
    routeService.getThreadState = original;
  }
});
const binding = load('client/src/pages/creativeHub/routing/creativeHubRouteBindings.ts');
const pageFilename = path.join(repo, 'client/src/pages/creativeHub/CreativeHubPage.tsx');
const pageSource = fs.readFileSync(pageFilename, 'utf8');
const pageAST = ts.createSourceFile(pageFilename, pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let removeInitializer;
const routeEffects = [];
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(pageAST) === 'removeThread') removeInitializer = node.initializer.getText(pageAST);
  if (ts.isCallExpression(node) && node.expression.getText(pageAST) === 'useEffect') {
    const effect = node.arguments[0].getText(pageAST);
    if (effect.includes('initialThread') && (effect.includes('setSearchParams') || effect.includes('autoCreateThread()'))) routeEffects.push(effect);
  }
  ts.forEachChild(node, visit);
}
visit(pageAST);
function compileExpression(expression, context) {
  const js = ts.transpileModule('var diagnostic = ' + expression + '; diagnostic;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(js, context);
}
async function deleteScenario(initialThreads) {
  let search = new URLSearchParams('threadId=a&novelId=novel-a');
  let cache = { success: true, data: initialThreads };
  const routes = ['a'];
  let autoCreateCount = 0;
  const context = {
    ...binding, Error,
    threadActionInFlightRef: { current: false }, activeThreadIdRef: { current: 'a' }, skipAutoCreateKeyRef: { current: null }, autoCreateThreadKey: 'blank', threads: initialThreads,
    setThreadActionPendingId() {}, deleteCreativeHubThread: async () => {},
    queryKeys: { creativeHub: { threads: ['threads'] } },
    queryClient: { cancelQueries: async () => {}, getQueryData: () => cache, setQueryData: (_, updater) => { cache = updater(cache); }, invalidateQueries: async () => {} },
    toast: { error: error => { throw new Error(error); } },
    setSearchParams: updater => { search = updater(search); routes.push(search.get('threadId') || '(empty)'); },
    threadsQuery: { isSuccess: true },
    autoCreateThread: () => { autoCreateCount++; },
  };
  await compileExpression(removeInitializer, context)('a');
  context.activeThreadId = search.get('threadId') || '';
  context.initialThread = binding.findCreativeHubInitialThread(cache.data, binding.buildCreativeHubBindingsFromSearch(search), false);
  for (const effect of routeEffects) compileExpression(effect, context)();
  return { routes, autoCreateCount, remaining: cache.data.map(thread => thread.id) };
}
test('Deleting active thread selects the next thread without an empty route', async () => {
  const result = await deleteScenario([{ id: 'a', resourceBindings: { novelId: 'novel-a' } }, { id: 'b', resourceBindings: { novelId: 'novel-b' } }]);
  assert.deepEqual(result.routes, ['a', 'b']);
  assert.equal(result.autoCreateCount, 0);

});
test('Deleting last thread preserves empty state without automatically recreating it', async () => {
  const result = await deleteScenario([{ id: 'a', resourceBindings: {} }]);
  assert.deepEqual(result.routes, ['a', '(empty)']);
  assert.equal(result.autoCreateCount, 0);

});
const langgraph = fromServer('@langchain/langgraph');
const graphState = load('server/src/creativeHub/langgraphState.ts', { '@langchain/langgraph': langgraph });
const graphHelpers = load('server/src/creativeHub/creativeHubGraphHelpers.ts');
let injectStepFailure = false;
let injectPlannerFailure = false;
let injectAnswerFailure = false;
let injectCheckpointFailure = false;
let plannerBarrier;
const threadFailures = [];
class MemoryTraceStore {
  runs = [];
  async listRuns() { return this.runs; }
  async createRun(input) { const run = { ...input, id: 'run-' + this.runs.length, status: 'queued' }; this.runs.push(run); return run; }
  async updateRun(id, patch) { Object.assign(this.runs.find(x => x.id === id), patch); }
  async addStep() { if (injectStepFailure) { injectStepFailure = false; throw new Error('simulated trace write failure'); } return { id: 'step' }; }
}
class MemoryExecutor {
  constructor(store) { this.store = store; }
  async runActionPlan(runId, _goal, _actions, _context, _intent, _failRun, callbacks) {
    await this.store.updateRun(runId, { status: 'succeeded' });
    callbacks.onRunStatus({ runId, status: 'succeeded' });
    if (injectAnswerFailure) throw new Error('simulated answer failure');
    return { assistantOutput: 'mock response', steps: [] };
  }
}
const graphModule = load('server/src/creativeHub/CreativeHubLangGraph.ts', {
  '@langchain/langgraph': langgraph,
  '../agents/orchestrator': { createStructuredPlan: async () => { if (plannerBarrier) await plannerBarrier; if (injectPlannerFailure) throw new Error('simulated model unavailable'); return { actions: [], plan: {}, structuredIntent: {}, source: 'llm', validationWarnings: [] }; } },
  '../agents/traceStore': { AgentTraceStore: MemoryTraceStore },
  '../agents/runtime/RunExecutionService': { RunExecutionService: MemoryExecutor },
  '../agents/runtime/runtimeHelpers': { safeJson: JSON.stringify },
  '../services/novel/NovelProductionService': { novelProductionService: {} },
  './toolEventPayloads': { sanitizeCreativeHubToolOutput: (_, value) => value },
  './creativeHubToolPolicy': { filterCreativeHubActions: actions => ({ allowedActions: actions, blockedTools: [] }) },
  './CreativeHubService': { creativeHubService: {
    saveCheckpoint: async (_, value) => { if (injectCheckpointFailure) throw new Error('simulated checkpoint failure'); return value; },
    updateThread: async (id, patch) => threadFailures.push({ id, ...patch }),
  } },
  './creativeHubTurnSummary': { buildCreativeHubTurnSummary: () => null },
  './creativeHubGraphHelpers': graphHelpers,
  './creativeHubRuntimeHelpers': helpers,
  './langgraphState': graphState,
});
const graphInput = { threadId: 'mock-thread', messages: [{ type: 'human', content: '你好' }], resourceBindings: {}, runSettings: { provider: 'deepseek', model: 'mock-model' } };
test('Graph succeeds with healthy mocked dependencies and can answer another prompt', async () => {
  const graph = new graphModule.CreativeHubLangGraph();
  assert.equal((await graph.runThread(graphInput, () => {})).status, 'idle');
  assert.equal((await graph.runThread(graphInput, () => {})).assistantOutput, 'mock response');
});
test('Planner failure correctly releases the run so a retry can proceed', async () => {
  const graph = new graphModule.CreativeHubLangGraph();
  injectPlannerFailure = true;
  await assert.rejects(graph.runThread(graphInput, () => {}), /simulated model unavailable/);
  injectPlannerFailure = false;
  assert.equal(graph.store.runs[0].status, 'failed');
  assert.equal((await graph.runThread(graphInput, () => {})).assistantOutput, 'mock response');
});
test('An exception outside planner try closes failed run and permits another prompt', async () => {
  const graph = new graphModule.CreativeHubLangGraph();
  injectStepFailure = true;
  await assert.rejects(graph.runThread(graphInput, () => {}), /simulated trace write failure/);
  assert.equal(graph.store.runs[0].status, 'failed');
  assert.equal(threadFailures.at(-1).status, 'error');
  assert.equal(threadFailures.at(-1).latestRunId, graph.store.runs[0].id);
  for (const content of ['你好', '查看状态']) assert.equal((await graph.runThread({ ...graphInput, messages: [{ type: 'human', content }] }, () => {})).assistantOutput, 'mock response');
});
test('Answer and checkpoint failures close the run and preserve the concrete thread error', async () => {
  for (const stage of ['answer', 'checkpoint']) {
    const graph = new graphModule.CreativeHubLangGraph();
    injectAnswerFailure = stage === 'answer';
    injectCheckpointFailure = stage === 'checkpoint';
    try {
      await assert.rejects(graph.runThread(graphInput, () => {}), new RegExp('simulated ' + stage + ' failure'));
      assert.equal(graph.store.runs[0].status, 'failed');
      assert.match(threadFailures.at(-1).latestError, new RegExp(stage));
    } finally {
      injectAnswerFailure = false;
      injectCheckpointFailure = false;
    }
    assert.equal((await graph.runThread(graphInput, () => {})).assistantOutput, 'mock response');
  }
});
test('A running record with no active invocation is recovered before a new question', async () => {
  const graph = new graphModule.CreativeHubLangGraph();
  graph.store.runs.push({ id: 'interrupted-run', status: 'running' });
  assert.equal((await graph.runThread(graphInput, () => {})).assistantOutput, 'mock response');
  assert.equal(graph.store.runs[0].status, 'failed');
  assert.match(graph.store.runs[0].error, /中断/);
});
test('Waiting approvals remain protected and are never automatically recovered', async () => {
  const graph = new graphModule.CreativeHubLangGraph();
  graph.store.runs.push({ id: 'approval-run', status: 'waiting_approval' });
  await assert.rejects(graph.runThread(graphInput, () => {}), /等待审批/);
  assert.equal(graph.store.runs[0].status, 'waiting_approval');
});
test('Concurrent questions cannot recover or fail an active invocation', async () => {
  const graph = new graphModule.CreativeHubLangGraph();
  let release;
  plannerBarrier = new Promise(resolve => { release = resolve; });
  const first = graph.runThread(graphInput, () => {});
  try {
    while (!graph.store.runs.length) await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(graph.runThread(graphInput, () => {}), /仍在执行中/);
    assert.equal(graph.store.runs.length, 1);
    assert.equal(graph.store.runs[0].status, 'running');
  } finally {
    plannerBarrier = undefined;
    release();
    await first;
  }
});
test('Thread protection is shared across graph instances in the same API process', async () => {
  const firstGraph = new graphModule.CreativeHubLangGraph();
  const otherGraph = new graphModule.CreativeHubLangGraph();
  let release;
  plannerBarrier = new Promise(resolve => { release = resolve; });
  const first = firstGraph.runThread(graphInput, () => {});
  try {
    while (!firstGraph.store.runs.length) await new Promise(resolve => setImmediate(resolve));
    plannerBarrier = undefined;
    await assert.rejects(otherGraph.runThread(graphInput, () => {}), /仍在执行中/);
    assert.equal(firstGraph.store.runs[0].status, 'running');
  } finally {
    plannerBarrier = undefined;
    release();
    await first;
  }
});
const interruptState = load('server/src/creativeHub/creativeHubInterruptState.ts', { '@langchain/langgraph': langgraph });
const interruptModule = load('server/src/creativeHub/CreativeHubInterruptLangGraph.ts', {
  '@langchain/langgraph': langgraph,
  '../agents/traceStore': { AgentTraceStore: MemoryTraceStore },
  '../agents/runtime/RunExecutionService': { RunExecutionService: MemoryExecutor },
  '../agents/runtime/ApprovalContinuationService': { ApprovalContinuationService: class {} },
  '../services/novel/NovelProductionService': { novelProductionService: {} },
  './toolEventPayloads': {}, './creativeHubToolPolicy': {}, './CreativeHubService': {},
  './creativeHubRuntimeHelpers': helpers,
  './creativeHubGraphHelpers': graphHelpers,
  './creativeHubInterruptState': interruptState,
});
test('Approval continuation protects its thread from a new question and releases it afterward', async () => {
  const interrupt = new interruptModule.CreativeHubInterruptLangGraph();
  const question = new graphModule.CreativeHubLangGraph();
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  interrupt.graph = { invoke: async state => { await barrier; return state; } };
  const pending = interrupt.resolveInterrupt({ threadId: 'mock-thread', interruptId: 'approval', action: 'approve' }, () => {});
  try {
    await assert.rejects(question.runThread(graphInput, () => {}), /仍在执行中/);
  } finally {
    release();
    await pending;
  }
  assert.equal((await question.runThread(graphInput, () => {})).assistantOutput, 'mock response');
});
