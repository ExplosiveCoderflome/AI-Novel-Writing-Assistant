export interface RagTargetDescription {
  kind: "embedding" | "reranker";
  provider: string;
  model: string;
  configurationKey: string;
}
export interface RagHttpRequest extends RagTargetDescription {
  input: Record<string, unknown>;
  attempt: number;
}
export interface RagHttpReply {status: number; body: string}
export interface RagExecutionPorts {
  retrieve<T>(query: string, options: unknown, operation: () => Promise<T>): Promise<T>;
  request(input: RagHttpRequest, send: () => Promise<RagHttpReply>): Promise<RagHttpReply>;
}
