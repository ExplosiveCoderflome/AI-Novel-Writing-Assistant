import type {Prisma} from "@prisma/client";
import {prisma} from "../../../../db/prisma";
import {queueRagUpsert} from "../../novelCoreSupport";

type SavedMember = {id: string; name: string; role: string};

/** Serialize initial cast creation per book. A retry sees either the full roster or an empty book. */
export async function saveOpeningCast(
  novelId: string,
  members: Omit<Prisma.CharacterCreateManyInput, "novelId">[],
  applyOption?: (tx: Prisma.TransactionClient, saved: SavedMember[]) => Promise<void>,
) {
  if (!members.length || new Set(members.map(member => member.name)).size !== members.length) {
    throw new Error("角色阵容需要包含具名人物，每位人物的名字应可区分。");
  }
  const saved = await prisma.$transaction(async tx => {
    // Hold the book row through the empty check and all writes, including on PostgreSQL.
    await tx.novel.update({where: {id: novelId}, data: {updatedAt: new Date()}, select: {id: true}});
    const select = {id: true, name: true, role: true} as const;
    const existing = await tx.character.findMany({where: {novelId}, select, orderBy: {createdAt: "asc"}});
    if (existing.length) {
      if (applyOption) throw new Error("本书已有角色，请保留角色资料后重新准备阵容。");
      return {characters: existing, reused: true};
    }
    const rows = await tx.character.createManyAndReturn({data: members.map(member => ({...member, novelId})), select});
    const byName = new Map(rows.map(row => [row.name, row]));
    const characters = members.map(member => {
      const row = byName.get(member.name);
      if (!row) throw new Error("角色阵容未完整保存。");
      return row;
    });
    await applyOption?.(tx, characters);
    return {characters, reused: false};
  });
  if (!saved.reused) for (const row of saved.characters) queueRagUpsert("character", row.id);
  return saved;
}
