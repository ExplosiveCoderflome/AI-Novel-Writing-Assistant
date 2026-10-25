export function normalizeApiBaseURL(value: string, protocol = "openai_compatible"): string {
  const url = new URL(value.trim());
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("API URL 必须使用 HTTP(S)，且不能包含用户名或密码。");
  url.hash = ""; url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/(?:chat\/completions|responses|messages|models)$/, "");
  if (!url.pathname || url.pathname === "/") url.pathname = protocol === "gemini" ? "/v1beta" : "/v1";
  if (protocol === "gemini") url.pathname = url.pathname.replace(/\/openai$/, "").replace(/\/models\/[^/]+:(?:streamGenerateContent|generateContent)$/, "");
  return url.toString().replace(/\/$/, "");
}

/** Never forward credentials to redirects or a different origin. */
export function originBoundFetch(baseURL: string): typeof fetch {
  const origin = new URL(baseURL).origin;
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== origin) throw new Error("已阻止向其他主机发送此服务商凭据。");
    return fetch(input, { ...init, redirect: "error" });
  };
}

export async function* readSseJSON(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<{ event: string; data: any }> {
  const reader = body.getReader(), decoder = new TextDecoder();
  const onAbort = () => { void reader.cancel(signal?.reason).catch(() => {}); };
  signal?.addEventListener("abort",onAbort,{once:true});
  let buffer = "", event = "message", data: string[] = [];
  function frame() {
    if (!data.length) { event = "message"; return null; }
    const raw = data.join("\n"), name = event; data = []; event = "message";
    if (raw === "[DONE]") return { event: "done", data: null };
    try { return { event: name, data: JSON.parse(raw) }; }
    catch { throw new Error("接口流事件不是合法 JSON；请求已停止，未接受不完整结果。"); }
  }
  function line(value: string) {
    if (!value) return frame();
    if (value.startsWith(":")) return null;
    const i = value.indexOf(":"), field = i < 0 ? value : value.slice(0, i);
    const text = i < 0 ? "" : value.slice(i + 1).replace(/^ /, "");
    if (field === "event") event = text;
    if (field === "data") data.push(text);
    return null;
  }
  try {
    while (true) {
      signal?.throwIfAborted();
      const {value, done} = await reader.read();
      signal?.throwIfAborted();
      buffer += done ? decoder.decode() : decoder.decode(value, {stream:true});
      let match: RegExpExecArray | null;
      while ((match = /\r\n|\r|\n/.exec(buffer)) !== null) {
        if(match[0] === "\r" && match.index === buffer.length-1 && !done) break;
        const result = line(buffer.slice(0,match.index)); buffer = buffer.slice(match.index + match[0].length);
        if (result) yield result;
      }
      if (done) break;
    }
    if (buffer) { const result = line(buffer.replace(/\r$/, "")); if (result) yield result; }
    const last = frame(); if (last) yield last;
  } finally { signal?.removeEventListener("abort",onAbort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function assertApiResponse(response: Response, secret?: string): Promise<void> {
  if (response.ok) return;
  const raw = await response.text();
  let message = response.statusText;let code:string|undefined;
  try { const parsed = JSON.parse(raw); message = parsed.error?.message ?? parsed.message ?? message; if(typeof parsed.error?.code === "string" && /^[a-z_]{1,80}$/i.test(parsed.error.code))code=parsed.error.code; } catch {
    if(response.headers.get("content-type")?.includes("text/plain") && !/<(?:!doctype|html|script)/i.test(raw)) message=raw.trim().slice(0,240) || message;
  }
  if (secret) message = String(message).split(secret).join("[REDACTED]");
  message = String(message).replace(/Bearer\s+\S+/gi,"Bearer [REDACTED]").slice(0,240);
  const error = new Error(`接口拒绝请求（HTTP ${response.status}）：${message}`) as Error & {status?:number;retryable?:boolean;code?:string};
  error.status = response.status;error.retryable=response.status >= 500 || [408,409,429].includes(response.status);error.code=code;throw error;
}
