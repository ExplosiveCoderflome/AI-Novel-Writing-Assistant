import { prisma } from "../../db/prisma";

export interface DramaCharacterUpsertInput {
  name: string;
  archetype?: string;
  persona?: string;
  speechStyle?: string;
  visualAnchor?: unknown;
  voiceProfile?: unknown;
  relations?: unknown;
}

function stringifyOptional(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

export class DramaCharacterService {
  async listProjectCharacters(projectId: string) {
    return prisma.dramaCharacter.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });
  }

  async updateProjectCharacter(characterId: string, input: Partial<DramaCharacterUpsertInput>) {
    return prisma.dramaCharacter.update({
      where: { id: characterId },
      data: {
        name: input.name,
        archetype: input.archetype,
        persona: input.persona,
        speechStyle: input.speechStyle,
        visualAnchor: input.visualAnchor === undefined ? undefined : stringifyOptional(input.visualAnchor),
        voiceProfile: input.voiceProfile === undefined ? undefined : stringifyOptional(input.voiceProfile),
        relations: input.relations === undefined ? undefined : stringifyOptional(input.relations),
      },
    });
  }

  async listLibrary(projectId?: string) {
    return prisma.dramaCharacterLibrary.findMany({
      where: projectId ? { OR: [{ projectId }, { projectId: null }] } : undefined,
      orderBy: { createdAt: "desc" },
    });
  }

  async saveCharacterToLibrary(characterId: string, tags?: string[]) {
    const character = await prisma.dramaCharacter.findUnique({ where: { id: characterId } });
    if (!character) {
      throw new Error(`未找到短剧角色：${characterId}`);
    }
    return prisma.dramaCharacterLibrary.create({
      data: {
        projectId: character.projectId,
        name: character.name,
        archetype: character.archetype,
        persona: character.persona,
        speechStyle: character.speechStyle,
        visualAnchor: character.visualAnchor,
        voiceProfile: character.voiceProfile,
        relations: character.relations,
        tags: tags?.length ? JSON.stringify(tags) : null,
      },
    });
  }

  async importLibraryCharacter(projectId: string, libraryId: string) {
    const item = await prisma.dramaCharacterLibrary.findUnique({ where: { id: libraryId } });
    if (!item) {
      throw new Error(`未找到短剧角色库条目：${libraryId}`);
    }
    return prisma.dramaCharacter.create({
      data: {
        projectId,
        name: item.name,
        archetype: item.archetype,
        persona: item.persona,
        speechStyle: item.speechStyle,
        visualAnchor: item.visualAnchor,
        voiceProfile: item.voiceProfile,
        relations: item.relations,
      },
    });
  }
}

export const dramaCharacterService = new DramaCharacterService();
