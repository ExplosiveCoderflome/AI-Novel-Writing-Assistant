import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { AgentThinkingStep } from "@ai-novel/shared/types/agentConversation/turn";

function usageNote(tokens: number) {
  return `模型报告了 ${tokens} 个思考 token，未提供可展示的思考文字。`;
}

export function AgentThinking({ steps, running }: { steps?: AgentThinkingStep[]; running: boolean }) {
  const id = useId();
  const [choice, setChoice] = useState<boolean | null>(null);
  if (!steps?.length) return null;
  if (!steps.some(step => step.text.trim())) {
    const tokens = steps.reduce((sum, step) => sum + (step.reasoningTokens ?? 0), 0);
    if (tokens > 0) return <p className="agent-thinking-note">{usageNote(tokens)}</p>;
    if (running) return null;
    return <p className="agent-thinking-note">{steps.every(step => step.enabled === false)
      ? "本轮使用关闭思考的请求设置，模型未返回思考文字。"
      : "模型未返回可展示的思考文字。"}</p>;
  }
  const expanded = choice ?? running;
  return <div className="agent-thinking">
    <button type="button" aria-controls={id} aria-expanded={expanded} onClick={() => setChoice(!expanded)}>
      <ChevronRight size={14} aria-hidden="true" />思考过程
    </button>
    <div id={id} hidden={!expanded} className="agent-thinking-content">
      {steps.filter(step => step.text.trim() || step.reasoningTokens).map(step => <div key={step.stage}>
        {steps.length > 1 && <small>{step.stage}</small>}
        <p>{step.text.trim() ? step.text : usageNote(step.reasoningTokens!)}</p>
      </div>)}
    </div>
  </div>;
}
