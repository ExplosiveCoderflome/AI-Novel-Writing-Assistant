import {AsyncLocalStorage} from "node:async_hooks";
import {createHash} from "node:crypto";
import type {RagExecutionPorts, RagHttpRequest, RagHttpReply} from "./types";

interface Execution {ports: RagExecutionPorts; failure?: {error: unknown}}
const storage = new AsyncLocalStorage<Execution>();
export const ragConfigurationKey = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const ragReadOnlyExecution = (): boolean => storage.getStore() !== undefined;

/** A compatibility catch may degrade ordinary retrieval, but cannot erase a scoped safety failure. */
async function protectedOperation<T>(state: Execution, operation: () => Promise<T>): Promise<T> {
  if (state.failure) throw state.failure.error;
  try {return await operation();}
  catch (error) {state.failure ??= {error}; throw state.failure.error;}
}
export function withRagExecutionScope<T>(ports: RagExecutionPorts, operation: () => Promise<T>): Promise<T> {
  const state: Execution = {ports};
  return storage.run(state, async () => {
    const result = await protectedOperation(state, operation);
    if (state.failure) throw state.failure.error;
    return result;
  });
}
export function scopedRagRetrieve<T>(query: string, options: unknown, operation: () => Promise<T>): Promise<T> {
  const state = storage.getStore();
  return state ? protectedOperation(state, () => state.ports.retrieve(query, options, operation)) : operation();
}
export function protectRagRead<T>(operation: () => Promise<T>): Promise<T> {
  const state = storage.getStore();
  return state ? protectedOperation(state, operation) : operation();
}

/** Responses retain only fields used by native parsers and usage accounting, never headers or credentials. */
async function readReply(response: Response): Promise<RagHttpReply> {
  let body = "{}";
  try {
    const value = await response.json() as Record<string, unknown> | unknown[];
    body = JSON.stringify(Array.isArray(value) ? value : {data: value.data, results: value.results, usage: value.usage});
  } catch { /* An unusable body follows the existing native malformed-response handling. */ }
  return {status: response.status, body};
}
export async function scopedRagFetch(input: RagHttpRequest, send: () => Promise<Response>): Promise<Response> {
  const state = storage.getStore();
  if (!state) return send();
  const reply = await protectedOperation(state, () => state.ports.request(input, async () => readReply(await send())));
  return new Response([204,205,304].includes(reply.status) ? null : reply.body,
    {status: reply.status, headers: {"content-type": "application/json"}});
}

export class RagIndexUnavailableError extends Error {
  readonly code = "production_rag_index_not_ready";
  readonly sourceRoute = "/knowledge";
  constructor(cause?: unknown) {super("知识库索引尚未就绪，请到知识库页面检查集合与索引后继续。", {cause}); this.name = "RagIndexUnavailableError";}
}
