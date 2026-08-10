export * from "./structuredOutline.utils";
export * from "./structuredOutlineSync.utils";
export * from "./novelBasicInfo.shared";

interface WorldContextSummaryInput {
  name: string;
  worldType?: string | null;
  description?: string | null;
  overviewSummary?: string | null;
  axioms?: string | null;
  magicSystem?: string | null;
  conflicts?: string | null;
}

export function buildWorldInjectionSummary(world: WorldContextSummaryInput | null | undefined): string | null {
  if (!world) {
    return null;
  }

  let axioms: string[] = [];
  if (world.axioms?.trim()) {
    try {
      const parsed = JSON.parse(world.axioms) as string[];
      axioms = Array.isArray(parsed) ? parsed.filter((item) => item.trim()).slice(0, 3) : [];
    } catch {
      axioms = world.axioms
        .split(/[\n,，;；]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 3);
    }
  }

  const summaryBlock = world.overviewSummary?.trim() || world.description?.trim() || "No summary.";
  const magicBlock = world.magicSystem?.trim() ? world.magicSystem.trim().slice(0, 120) : "";
  const conflictBlock = world.conflicts?.trim() ? world.conflicts.trim().slice(0, 120) : "";

  const lines = [
    `${world.name}${world.worldType ? ` (${world.worldType})` : ""}`,
    `Summary: ${summaryBlock}`,
    ...(axioms.length > 0 ? [`Axioms: ${axioms.join(" | ")}`] : []),
    ...(magicBlock ? [`Power: ${magicBlock}`] : []),
    ...(conflictBlock ? [`Conflict: ${conflictBlock}`] : []),
  ];
  return lines.join("\n");
}

export function replaceFirstOccurrence(source: string, target: string, replacement: string): string {
  const index = source.indexOf(target);
  if (index < 0) {
    return source;
  }
  return source.slice(0, index) + replacement + source.slice(index + target.length);
}
