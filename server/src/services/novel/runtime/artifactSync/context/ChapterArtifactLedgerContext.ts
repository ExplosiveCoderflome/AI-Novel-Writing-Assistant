import type { CharacterResourceLedgerItem } from "@ai-novel/shared/types/characterResource";

interface CharacterContextRow {
  id: string;
  name: string;
  role: string;
  castRole: string | null;
  currentGoal: string | null;
  currentState: string | null;
}

interface PayoffContextRow {
  ledgerKey: string;
  title: string;
  currentStatus: string;
  summary: string;
  targetStartChapterOrder: number | null;
  targetEndChapterOrder: number | null;
  lastTouchedChapterOrder: number | null;
}

function ordered<T>(items: readonly T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
}

function row(parts: Array<string | null | undefined | false>): string {
  return parts.filter(Boolean).join(" | ");
}

/** Separate identity from current state without copying historical evidence into model input. */
export function buildChapterArtifactLedgerContext(input: {
  characters: readonly CharacterContextRow[];
  resources: readonly CharacterResourceLedgerItem[];
  payoffs: readonly PayoffContextRow[];
}) {
  const characters = ordered(input.characters, item => item.id);
  // Preserve the existing recent-item selection, then normalize order within that selection.
  const resources = ordered(input.resources.slice(0, 20), item => item.resourceKey);
  const payoffs = ordered(input.payoffs.slice(0, 20), item => item.ledgerKey);
  return {
    characterRosterText: characters.map(item => row([
      `- ${item.id}`, item.name, item.role, item.castRole && `cast=${item.castRole}`,
    ])).join("\n"),
    characterStateText: characters.map(item => row([
      `- ${item.id}`, item.currentGoal && `goal=${item.currentGoal}`,
      item.currentState && `state=${item.currentState}`,
    ])).join("\n"),
    resourceCatalogText: resources.map(item => row([
      `- ${item.resourceKey}`, item.name, `type=${item.resourceType}`, `function=${item.narrativeFunction}`,
    ])).join("\n"),
    existingResourceText: resources.map(item => row([
      `- ${item.resourceKey}`,
      `owner=${item.ownerType}:${item.ownerCharacterId ?? item.ownerId ?? "?"}:${item.ownerName ?? "未知"}`,
      `holder=${item.holderCharacterId ?? "?"}:${item.holderCharacterName ?? "未知"}`,
      `status=${item.status}`,
      `readerKnows=${item.readerKnows}`, `holderKnows=${item.holderKnows}`,
      item.knownByCharacterIds.length > 0 && `knownBy=${JSON.stringify(ordered(item.knownByCharacterIds, id => id))}`,
      (item.expectedUseStartChapterOrder != null || item.expectedUseEndChapterOrder != null)
        && `use=${item.expectedUseStartChapterOrder ?? "?"}-${item.expectedUseEndChapterOrder ?? "?"}`,
      item.constraints.length > 0 && `constraints=${JSON.stringify(item.constraints)}`,
      item.riskSignals.length > 0 && `risks=${JSON.stringify(item.riskSignals.map(({code, severity, summary}) => ({code, severity, summary})))}`,
      item.summary,
    ])).join("\n"),
    payoffCatalogText: payoffs.map(item => row([`- ${item.ledgerKey}`, item.title])).join("\n"),
    existingPayoffText: payoffs.map(item => row([
      `- ${item.ledgerKey}`, `status=${item.currentStatus}`,
      (item.targetStartChapterOrder != null || item.targetEndChapterOrder != null)
        && `target=${item.targetStartChapterOrder ?? "?"}-${item.targetEndChapterOrder ?? "?"}`,
      item.lastTouchedChapterOrder != null && `lastTouched=${item.lastTouchedChapterOrder}`,
      item.summary,
    ])).join("\n"),
  };
}
