import { createContext, useContext, type PropsWithChildren } from "react";
import type { FailureDiagnostic } from "@ai-novel/shared/types/agent";
import type { CreativeHubInterrupt } from "@ai-novel/shared/types/creativeHub";

interface CreativeHubInlineControlsValue {
  interrupt?: CreativeHubInterrupt;
  diagnostics?: FailureDiagnostic;
  approvalNote: string;
  onApprovalNoteChange?: (value: string) => void;
  onResolveInterrupt?: (action: "approve" | "reject") => void;
  onQuickAction?: (prompt: string) => void;
}

const CreativeHubInlineControlsContext = createContext<CreativeHubInlineControlsValue>({
  approvalNote: "",
});

export function CreativeHubInlineControlsProvider({
  value,
  children,
}: PropsWithChildren<{ value: CreativeHubInlineControlsValue }>) {
  return (
    <CreativeHubInlineControlsContext.Provider value={value}>
      {children}
    </CreativeHubInlineControlsContext.Provider>
  );
}

export function useCreativeHubInlineControls() {
  return useContext(CreativeHubInlineControlsContext);
}
