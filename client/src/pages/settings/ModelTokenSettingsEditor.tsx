import { useEffect, useState } from "react";
import { apiClient } from "@/api/client";
import type { APIKeyStatus } from "@/api/settings";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const fields = [
  ["maxOutputTokens", "最大输出（请求上限，tokens）"],
  ["contextWindowTokens", "上下文窗口（能力值，tokens）"],
  ["maxInputTokens", "最大输入（未知可留空）"],
  ["maxReasoningTokens", "最大思考容量（能力备注，不发送参数）"],
] as const;
type Values = Record<typeof fields[number][0], string>;
const protocolChoices = [["auto","自动（已知官方端点，其他为 Chat）"],["openai_compatible","OpenAI 兼容 Chat Completions"],["openai_responses","OpenAI Responses"],["deepseek","DeepSeek Chat"],["anthropic","Claude 兼容 Messages"],["gemini","Gemini 原生 generateContent"],["llama_cpp","llama.cpp Chat"]];
const empty: Values = { maxOutputTokens: "", contextWindowTokens: "", maxInputTokens: "", maxReasoningTokens: "" };

export default function ModelTokenSettingsEditor({ providers }: { providers: APIKeyStatus[] }) {
  const [provider, setProvider] = useState("");
  const effectiveProvider = provider || providers[0]?.provider || "";
  const config = providers.find((p) => p.provider === effectiveProvider);
  const [model, setModel] = useState("");
  const effectiveModel = model || config?.currentModel || "";
  const [values, setValues] = useState<Values>(empty);
  const [sharing, setSharing] = useState("unknown");
  const [protocol, setProtocol] = useState("auto");
  const [chatReasoningFormat,setChatReasoningFormat] = useState("none");
  const [thinkingMode, setThinkingMode] = useState("default");
  const [thinkingEffort, setThinkingEffort] = useState("default");
  const [thinkingBudget, setThinkingBudget] = useState("");
  const [outputParameter, setOutputParameter] = useState("auto");
  const [status, setStatus] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true; setLoaded(false);
    if (!effectiveProvider || !effectiveModel) return;
    apiClient.get("/settings/model-token-settings", { params: { provider: effectiveProvider, model: effectiveModel } }).then((r) => {
      if (!active) return;
      const data = r.data.data;
      setValues(Object.fromEntries(fields.map(([k]) => [k, data[k] == null ? "" : String(data[k])])) as Values);
      setProtocol(data.requestProtocol || "auto"); setChatReasoningFormat(data.chatReasoningFormat || "none"); setThinkingMode(data.thinkingMode || "default");
      setThinkingEffort(data.thinkingEffort || "default"); setThinkingBudget(data.thinkingBudgetTokens == null ? "" : String(data.thinkingBudgetTokens));
      setOutputParameter(data.outputTokenParameter || "auto");
      setSharing(data.budgetSharing || "unknown"); setLoaded(true); setStatus("");
    }).catch(() => { if (active) setStatus("读取设置失败，请检查本地服务后重试。"); });
    return () => { active = false; };
  }, [effectiveProvider, effectiveModel]);
  async function save() {
    try {
      const data: Record<string, unknown> = { provider: effectiveProvider, model: effectiveModel, budgetSharing: sharing };
      for (const [key] of fields) {
        const text = values[key].trim(); const value = text ? Number(text) : null;
        if (value !== null && (!Number.isSafeInteger(value) || value <= 0)) throw new Error("请输入正整数，未知或使用默认时留空。");
        data[key] = value;
      }
      const budget = thinkingBudget.trim() ? Number(thinkingBudget) : null;
      if (budget !== null && (!Number.isSafeInteger(budget) || budget <= 0)) throw new Error("思考预算需为正整数，留空不发送。");
      Object.assign(data, {requestProtocol:protocol, chatReasoningFormat, thinkingMode, thinkingEffort, thinkingBudgetTokens:budget, outputTokenParameter:outputParameter});
      await apiClient.put("/settings/model-token-settings", data);
      setStatus("已保存到此模型；后续请求按设置执行。");
    } catch (error) {
      const data=(error as {response?:{data?:{error?:string;message?:string}}})?.response?.data;
      setStatus(data?.error ?? data?.message ?? (error instanceof Error ? error.message : "保存失败，请检查输入。"));
    }
  }
  return <section className="space-y-4 py-5">
    <div><h2 className="text-lg font-semibold">模型输出与上下文设置</h2>
      <p className="text-sm text-muted-foreground">最大输出留空保留原默认，可填写接口支持的 128K、256K 对应整数。能力值由你填写，不代表网关已验证。上下文、输出和思考不能保证同时用满。</p></div>
    <div className="grid gap-3 md:grid-cols-2">
      <label className="space-y-1 text-sm">服务商<select className="h-9 w-full rounded-md border bg-background px-3" value={effectiveProvider} onChange={(e) => { setProvider(e.target.value); setModel(""); }}>
        {providers.map((p) => <option key={p.provider} value={p.provider}>{p.displayName || p.provider}</option>)}</select></label>
      <label className="space-y-1 text-sm">模型 ID<Input value={effectiveModel} onChange={(e) => setModel(e.target.value)} placeholder="可手动输入接口的模型 ID" /></label>
      <label className="space-y-1 text-sm">接口模式<select className="h-9 w-full rounded-md border bg-background px-3" value={protocol} onChange={e=>{const next=e.target.value;setProtocol(next);if(next !== "auto" && next !== "openai_compatible")setOutputParameter("auto");}}>{protocolChoices.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
      {fields.map(([key, label]) => <label className="space-y-1 text-sm" key={key}>{label}<Input type="number" min="1" step="1" value={values[key]} placeholder="留空：默认或未知" onChange={(e) => setValues({ ...values, [key]: e.target.value })} /></label>)}
      <label className="space-y-1 text-sm">输入和生成是否共享上下文预算<select className="h-9 w-full rounded-md border bg-background px-3" value={sharing} onChange={(e) => setSharing(e.target.value)}>
        <option value="unknown">未知，不推断共享方式</option><option value="shared">接口明确共享</option><option value="separate">接口明确独立</option></select></label>
      <label className="space-y-1 text-sm">通用 Chat 思考扩展<select className="h-9 w-full rounded-md border bg-background px-3" value={chatReasoningFormat} onChange={e=>setChatReasoningFormat(e.target.value)}>
        <option value="none">未声明（仅服务默认）</option><option value="reasoning_effort">reasoning_effort（服务需明确支持）</option></select></label>
      <label className="space-y-1 text-sm">思考模式<select className="h-9 w-full rounded-md border bg-background px-3" value={thinkingMode} onChange={e=>setThinkingMode(e.target.value)}>
        <option value="default">沿用服务与厂商设置（不新增覆盖）</option><option value="disabled">关闭（接口需支持）</option><option value="enabled">开启（Claude 需固定预算）</option><option value="adaptive">Claude 自适应（模型需支持）</option></select></label>
      <label className="space-y-1 text-sm">思考强度<select className="h-9 w-full rounded-md border bg-background px-3" value={thinkingEffort} onChange={e=>setThinkingEffort(e.target.value)}>
        {["default","none","minimal","low","medium","high","xhigh","max"].map(x=><option key={x} value={x}>{x === "default" ? "服务默认" : x}</option>)}</select></label>
      <label className="space-y-1 text-sm">请求思考预算（仅支持此字段的 Claude / Gemini）<Input type="number" min="1" step="1" value={thinkingBudget} onChange={e=>setThinkingBudget(e.target.value)} placeholder="留空不发送" /></label>
      <label className="space-y-1 text-sm">Chat 输出字段<select className="h-9 w-full rounded-md border bg-background px-3" value={outputParameter} disabled={protocol !== "auto" && protocol !== "openai_compatible"} onChange={e=>setOutputParameter(e.target.value)}>
        <option value="auto">自动（仅官方 OpenAI 推理模型使用 completion 字段）</option><option value="max_tokens">max_tokens</option><option value="max_completion_tokens">max_completion_tokens</option></select></label>
    </div>
    <p className="text-xs text-muted-foreground">生成上限可能包含思考和可见正文，以接口协议为准。思考容量只作备注；请求思考预算与强度依接口支持，不能同时适用于所有模型。通用 Chat 仅在声明兼容 reasoning_effort 时发送该扩展；其他接口按所选模式发送，服务仍会核验模型支持。长请求可能增加耗时与用量。</p>
    <p className="text-xs text-muted-foreground">{protocol === "anthropic" ? "Claude 固定思考预算至少 1024，且小于总输出；新模型可按服务支持选择自适应。" : protocol === "gemini" ? "Gemini 的思考强度与固定预算择一，关闭思考也需模型支持。" : protocol === "llama_cpp" ? "llama.cpp 的思考开关依赖聊天模板；思考容量备注不会作为独立预算发送。" : "Responses 与 DeepSeek 的总生成上限通常包含思考；按实际接口支持设置，不将两者容量相加。"}</p>
    <div className="flex items-center gap-3"><Button disabled={!loaded} onClick={() => void save()}>保存模型设置</Button><span className="text-sm" role="status">{status}</span></div>
  </section>;
}
