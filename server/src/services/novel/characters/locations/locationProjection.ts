import type { CharacterLocationDelta, CharacterLocationProjection } from "@ai-novel/shared/types/characterLocation";

const compact = (text: string) => text.replace(/\s+/g, " ").trim();

/** Semantic judgments come from AI. This layer checks IDs, duplicate output and verbatim evidence. */
export function projectLocationDeltas(input: {
  content: string;
  characters: Array<{ id: string; name: string }>;
  deltas: CharacterLocationDelta[];
  contentProvenance?: "confirmed" | "debt";
}): CharacterLocationProjection["records"] {
  const characters = new Map(input.characters.map(character => [character.id, character.name]));
  const groups = new Map<string, CharacterLocationDelta[]>();
  for (const delta of input.deltas) {
    if (characters.get(delta.characterId) !== delta.characterName || delta.timeContext !== "present") continue;
    const group = groups.get(delta.characterId) ?? [];
    group.push(delta);
    groups.set(delta.characterId, group);
  }
  const content = compact(input.content);
  return [...groups].map(([characterId, deltas]) => {
    // The wire contract requests one final record per actor. Never choose an arbitrary duplicate.
    if (deltas.length !== 1) {
      return { characterId, locationName: null, evidence: null, concern: "本章位置记录存在多项判断，保留最后确认的位置。" };
    }
    const delta = deltas[0];
    const evidence = compact(delta.evidence);
    const validEvidence = Boolean(evidence) && content.includes(evidence);
    const canConfirm = validEvidence && delta.locationName
      && (delta.movementType === "stay" || delta.movementType === "move")
      && delta.continuityStatus === "consistent" && input.contentProvenance !== "debt";
    return {
      characterId,
      locationName: canConfirm ? delta.locationName : null,
      evidence: validEvidence ? delta.evidence : null,
      concern: canConfirm ? null : !validEvidence
        ? "本章位置判断缺少可定位的正文证据，保留最后确认的位置。"
        : `候选位置=${delta.locationName || "未知"}；${input.contentProvenance === "debt"
          ? "本章质量待核对，位置变化暂不作为已确认事实。"
          : delta.explanation || "本章移动经过或位置关系不明确，保留最后确认的位置。"}`,
    };
  });
}
