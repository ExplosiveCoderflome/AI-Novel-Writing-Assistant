import { prisma } from "../../../../db/prisma";
import { castFieldLabels, type CastField } from "@ai-novel/shared/types/director/castReview/discussion";
import { reviewAssetEditSchema } from "@ai-novel/shared/types/director/revision";

/** Commands identify reviewed fields. The character record owns their current values. */
export async function confirmedCastForPlanning(runId: string, novelId: string) {
  const commands = await prisma.directorNextCommand.findMany({
    where: { runId, type: "resolve_gate", run: { novelId } }, select: { payloadJson: true },
  });
  const selected = new Map<string, Set<CastField>>();
  for (const row of commands) {
    const command = JSON.parse(row.payloadJson);
    if (command?.decision !== "confirm_after_edit" || !command.assetEdit) continue;
    const edit = reviewAssetEditSchema.parse(command.assetEdit);
    if (edit.type !== "character_cast") continue;
    for (const { id, field } of edit.changes) {
      const fields = selected.get(id) ?? new Set<CastField>();
      fields.add(field);
      selected.set(id, fields);
    }
  }
  if (!selected.size) return undefined;
  const cast = await prisma.character.findMany({ where: { novelId, id: { in: [...selected.keys()] } }, orderBy: { id: "asc" },
    select: { id: true, name: true, role: true, personality: true, storyFunction: true, currentGoal: true } });
  return cast.map(person => ({
    name: person.name, role: person.role, fields: [...selected.get(person.id)!].map(field => ({
      label: castFieldLabels[field], value: person[field] ?? "",
    })),
  }));
}
