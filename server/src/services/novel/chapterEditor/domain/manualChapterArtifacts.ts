import { briefSummary, extractFacts } from "../../novelCoreShared";

/** Legacy editor projections; AI production facts remain owned by runtime/artifactSync. */
export function projectManualChapterArtifacts(content: string) {
  const facts = extractFacts(content);
  return {
    facts,
    summary: briefSummary(content, facts),
    keyEvents: facts.map((item) => item.content).slice(0, 3).join(""),
    characterStates: facts.filter((item) => item.category === "character")
      .map((item) => item.content).slice(0, 3).join(""),
  };
}

export type ManualChapterArtifacts = ReturnType<typeof projectManualChapterArtifacts>;
