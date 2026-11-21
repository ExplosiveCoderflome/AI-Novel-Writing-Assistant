import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { List, Sparkles } from "lucide-react";
import type { DirectorCandidate } from "@ai-novel/shared/types/novelDirector";
import { WorkspaceColumns } from "@/components/layout/resizableWorkspace";
import { Button } from "@/components/ui/button";
import { CandidateDiscussion } from "./CandidateDiscussion";
import type { CandidateSelection } from "./useCandidateSelection";
import "./candidateReviewWorkspace.css";

interface Props {
  taskId: string;
  selection: CandidateSelection;
  disabled: boolean;
  onApplied: (batchId: string, candidate: DirectorCandidate) => void;
  children: ReactNode;
}

export function CandidateReviewWorkspace({ taskId, selection, disabled, onApplied, children }: Props) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pane, setPane] = useState<"candidates" | "assistant">("candidates");
  const reading = useRef<HTMLDivElement>(null);
  const selector = useRef<HTMLSelectElement>(null);
  const restoreSelectorFocus = useRef(false);
  const pendingAnchor = useRef("");
  const assistantId = useId();
  const readingId = useId();
  const { active, options } = selection;

  useLayoutEffect(() => {
    if (restoreSelectorFocus.current) {
      selector.current?.focus({ preventScroll: true });
      restoreSelectorFocus.current = false;
    }
    if (!pendingAnchor.current) return;
    const reader = reading.current;
    const article = document.getElementById(pendingAnchor.current);
    if (article && reader && reader.clientHeight && reader.contains(article)) {
      reader.scrollTop += article.getBoundingClientRect().top - reader.getBoundingClientRect().top;
      pendingAnchor.current = "";
    }
  }, [active?.key, pane]);
  if (!active) return <>{children}</>;

  return <div className="candidate-workspace">
    <div className="candidate-pane-switch" role="group" aria-label="开书工作区视图">
      <Button type="button" size="sm" variant={pane === "candidates" ? "secondary" : "ghost"} aria-controls={readingId}
        aria-pressed={pane === "candidates"} onClick={() => setPane("candidates")}><List />方向候选</Button>
      <Button type="button" size="sm" variant={pane === "assistant" ? "secondary" : "ghost"} aria-controls={assistantId}
        aria-pressed={pane === "assistant"} onClick={() => setPane("assistant")}><Sparkles />开书助手</Button>
    </div>
    <WorkspaceColumns layoutId="opening-candidates" className="candidate-workspace-columns" data-pane={pane} minCenter={420}
      right={{ label: "调整开书助手宽度", initial: "clamp(18rem, 29%, 25rem)", min: 280 }}>
      <div id={readingId} ref={reading} className="candidate-reading">{children}</div>
      <aside id={assistantId} className="candidate-inspector" aria-label="方向讨论">
        <CandidateDiscussion key={active.key} taskId={taskId} batchId={active.batch.id} candidate={active.candidate}
          disabled={disabled} onApplied={onApplied} draft={drafts[active.key] ?? ""}
          onDraftChange={text => setDrafts(previous => ({ ...previous, [active.key]: text }))}
          context={<select ref={selector} aria-label="选择要讨论的方向" className="candidate-context-select" value={active.key}
            onChange={event => {
              restoreSelectorFocus.current = document.activeElement === event.currentTarget;
              pendingAnchor.current = event.target.value;
              selection.select(event.target.value);
            }}>
            {options.map(option => <option key={option.key} value={option.key}>
              {option.candidate.workingTitle} · {option.batch.roundLabel} · 方案 {option.number}
            </option>)}
          </select>} />
      </aside>
    </WorkspaceColumns>
  </div>;
}
