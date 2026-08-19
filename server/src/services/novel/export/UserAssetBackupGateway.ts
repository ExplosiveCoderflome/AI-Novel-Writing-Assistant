import { prisma } from "../../../db/prisma";

export interface UserProjectBackupPackage {
  schemaVersion: "1.0.0";
  exportedAt: string;
  novel: {
    id: string;
    title: string;
    description: string | null;
    writingMode: string;
    projectMode: string;
  };
  world: {
    id: string | null;
    name: string | null;
    description: string | null;
    axioms: string | null;
  } | null;
  chapters: Array<{
    id: string;
    title: string;
    order: number;
    content: string;
  }>;
  characters: Array<{
    id: string;
    name: string;
    role: string | null;
    storyFunction: string | null;
  }>;
}

export class UserAssetBackupGateway {
  /**
   * Safely exports a creator's project assets (Novel, World, Chapters, Characters) into a portable JSON package.
   */
  async exportProjectAssets(novelId: string): Promise<UserProjectBackupPackage> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: {
        chapters: {
          orderBy: { order: "asc" },
        },
        world: true,
        characters: true,
      },
    });

    if (!novel) {
      throw new Error(`[UserAssetBackupGateway] Novel with id ${novelId} not found.`);
    }

    return {
      schemaVersion: "1.0.0",
      exportedAt: new Date().toISOString(),
      novel: {
        id: novel.id,
        title: novel.title,
        description: novel.description,
        writingMode: novel.writingMode ?? "original",
        projectMode: novel.projectMode ?? "auto_pipeline",
      },
      world: novel.world
        ? {
            id: novel.world.id,
            name: novel.world.name,
            description: novel.world.description,
            axioms: novel.world.axioms,
          }
        : null,
      chapters: novel.chapters.map((ch) => ({
        id: ch.id,
        title: ch.title,
        order: ch.order,
        content: ch.content ?? "",
      })),
      characters: novel.characters.map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role,
        storyFunction: c.storyFunction,
      })),
    };
  }

  /**
   * Verifies the structural integrity of a project backup snapshot.
   */
  verifyBackupIntegrity(backupData: unknown): boolean {
    if (typeof backupData !== "object" || backupData === null) {
      return false;
    }
    const pkg = backupData as Partial<UserProjectBackupPackage>;
    if (pkg.schemaVersion !== "1.0.0") {
      return false;
    }
    if (!pkg.novel || typeof pkg.novel.id !== "string" || typeof pkg.novel.title !== "string") {
      return false;
    }
    if (!Array.isArray(pkg.chapters) || !Array.isArray(pkg.characters)) {
      return false;
    }
    return true;
  }
}

export const userAssetBackupGateway = new UserAssetBackupGateway();
