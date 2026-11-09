import { useEffect, useState, type ReactNode } from "react";
import { API_BASE_URL } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AccessTokenGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "ready" | "required">("checking");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function connect(accessToken?: string, signal?: AbortSignal) {
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE_URL}/access/session`, {
        method: accessToken ? "POST" : "GET", credentials: "include", cache: "no-store", signal,
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
      if (response.ok) { setToken(""); setState("ready"); setMessage(""); }
      else { setState("required"); setMessage((await response.json()).error ?? "连接失败，请重新输入访问令牌。"); }
    } catch (error) {
      if (!signal?.aborted) { setState("required"); setMessage("无法连接创作服务，请检查地址后重试。"); }
    } finally { setBusy(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    void connect(undefined, controller.signal);
    const requireAccess = () => { setState("required"); setMessage("请输入有效的访问令牌。"); };
    window.addEventListener("ai-novel:access-required", requireAccess);
    return () => { controller.abort(); window.removeEventListener("ai-novel:access-required", requireAccess); };
  }, []);
  if (state === "ready") return children;
  return <main className="flex min-h-dvh items-center justify-center bg-background p-6">
    <form className="w-full max-w-sm space-y-4" onSubmit={event => { event.preventDefault(); void connect(token.trim()); }}>
      <h1 className="text-xl font-semibold">连接写作工作台</h1>
      {state === "checking" ? <p role="status">正在连接创作服务…</p> : <>
        <p className="text-sm text-muted-foreground">输入部署者提供的访问令牌，查看小说并继续创作。</p>
        <label className="block space-y-2 text-sm">访问令牌<Input autoComplete="current-password" type="password" required value={token} onChange={event => setToken(event.target.value)} /></label>
        {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
        <Button disabled={busy} type="submit">{busy ? "连接中…" : "连接工作台"}</Button>
      </>}
    </form>
  </main>;
}
