import {hashProductionContent, InvalidProductionRequestError, ProductionSnapshotConflictError} from "../../../../modules/production";
import {canonicalProductionJson, checkContextBudget, ProductionBudgetNotDispatchedError, type ProductionJson} from "../../../../modules/production/common";
import {extractLlmTokenUsage, type InvocationUsageRecord} from "../../../../platform/llm/usage";
import {withRagExecutionScope, type RagExecutionPorts, type RagHttpRequest, type RagHttpReply} from "../../../../services/rag/execution";
import type {KernelRagConfiguration, KernelRagContextDependencies} from "./types";

const wire = (value: unknown): ProductionJson => JSON.parse(JSON.stringify(value ?? null));
const canonical = (value: unknown) => canonicalProductionJson(wire(value));
const hash = (value: unknown) => hashProductionContent(canonical(value));

function requestAllowance(request: RagHttpRequest, configuration: KernelRagConfiguration): number {
  const target = configuration.targets.find(row => row.kind === request.kind && row.provider === request.provider
    && row.model === request.model && row.configurationKey === request.configurationKey);
  const window = configuration.windows.find(row => row.provider === request.provider && row.model === request.model)?.contextWindow;
  if (!target || !window || request.input.model !== request.model) throw new ProductionSnapshotConflictError();
  const inputs = request.kind === "embedding" ? request.input.input
    : Array.isArray(request.input.documents) ? request.input.documents.map(row => `${request.input.query}\n${(row as {text?: unknown}).text}`) : null;
  if (!Array.isArray(inputs) || !inputs.length || inputs.some(input => typeof input !== "string"
    || !checkContextBudget({input, contextWindow: window, outputTokens: 0, safetyTokens: 256}).ok)) {
    throw new InvalidProductionRequestError("检索请求超过已配置模型的输入窗口。");
  }
  // The window applies to each embedding / query-document pair; the chapter pays for the complete batch.
  return new TextEncoder().encode(canonical(request.input)).length + 256;
}

/** Native retrieval stays intact; every paid HTTP attempt gets a distinct durable child request. */
export async function withKernelRagContext<T>(deps: KernelRagContextDependencies, operation: () => Promise<T>): Promise<T> {
  const configuration = structuredClone(deps.configuration);
  if (configuration.version !== 1) throw new InvalidProductionRequestError("Unknown retrieval configuration");
  const assertConfiguration = async () => {
    if (canonical(await deps.readConfiguration()) !== canonical(configuration)) throw new ProductionSnapshotConflictError();
    await deps.fence();
  };
  await assertConfiguration();
  if (configuration.enabled) await deps.assertIndex();
  let ordinal = 0;
  const denyRequest: RagExecutionPorts["request"] = async () => {throw new InvalidProductionRequestError("RAG request requires its retrieval checkpoint");};
  const ports: RagExecutionPorts = {
    request: denyRequest,
    async retrieve(query, options, retrieve) {
      if (!configuration.enabled) return retrieve();
      const slot = ordinal++, source = await deps.readSources(query, options);
      const candidate = wire({query, options, source});
      const saved = await deps.steps.read(`rag:input:${slot}`, async () => candidate);
      if (canonical(saved) !== canonical(candidate)) throw new ProductionSnapshotConflictError();
      const fence = async () => {
        await assertConfiguration();
        if (await deps.readSources(query, options) !== source) throw new ProductionSnapshotConflictError();
      };
      const pending = new Map<string, Promise<RagHttpReply>>();
      const request: RagExecutionPorts["request"] = (description, send) => {
        const key = hash(description);
        const previous = pending.get(key);
        if (previous) return previous;
        const current = (async () => {
          await fence();
          const tokens = requestAllowance(description, configuration);
          // Preparation's model slot requires a positive minimum. HTTP reservation below charges all input; no generated text is assumed.
          return await deps.steps.model(`rag:http:${slot}:${key}`, {identity: key, input: wire(description), outputTokens: 1}, async (_saved, requestKey) => {
            await fence();
            if (!await deps.budget.reserve(deps.run.progress.unit, requestKey, tokens)) throw new ProductionBudgetNotDispatchedError();
            try {await fence();} catch (error) {await deps.budget.releaseUndispatched(deps.run.progress.unit, requestKey); throw error;}
            const startedAt = new Date();
            let observed = false;
            const observe = async (reply?: RagHttpReply) => {
              if (observed) return;
              observed = true;
              let usage = null;
              try {usage = reply ? extractLlmTokenUsage(JSON.parse(reply.body), {protocol: "openai-compatible"}) : null;} catch { /* Unknown usage retains its reservation. */ }
              const record: InvocationUsageRecord = {invocationId: requestKey, provider: description.provider, model: description.model,
                requestProtocol: "openai-compatible", runId: deps.runId, workflowTaskId: null, generationJobId: null,
                novelId: deps.run.progress.unit.novelId, chapterId: deps.run.progress.unit.chapterId,
                stage: `rag_${description.kind}`, promptId: `rag.${description.kind}`, promptVersion: "kernel-rag@1",
                status: reply && reply.status >= 200 && reply.status < 300 ? "completed" : "failed", startedAt, finishedAt: new Date(), usage};
              await deps.budget.observe(deps.run.progress.unit, requestKey, record);
              await deps.recordUsage(record);
            };
            try {
              const reply = await send();
              await observe(reply);
              await fence();
              return wire(reply);
            } catch (error) {await observe(); throw error;}
          }) as unknown as RagHttpReply;
        })();
        pending.set(key, current);
        return current;
      };
      const result = await deps.steps.read(`rag:result:${slot}`, async () => wire(await withRagExecutionScope({request,
        retrieve: async () => {throw new InvalidProductionRequestError("Unexpected nested retrieval");}}, retrieve)));
      await fence();
      return result as Awaited<ReturnType<typeof retrieve>>;
    },
  };
  const result = await withRagExecutionScope(ports, operation);
  await assertConfiguration();
  return result;
}
