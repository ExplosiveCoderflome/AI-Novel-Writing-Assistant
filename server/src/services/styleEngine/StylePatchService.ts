import { prisma } from "../../db/prisma";

export class StylePatchService {
  /**
   * Records a style/anti-AI rule violation, upserting the corresponding StylePatch
   * and incrementing the violation count.
   */
  public async recordViolation(
    novelId: string,
    ruleKey: string,
    suggestion: string
  ): Promise<any> {
    const existing = await prisma.stylePatch.findUnique({
      where: {
        novelId_ruleKey: {
          novelId,
          ruleKey,
        },
      },
    });

    // Compile a neat correction directive
    const promptInstruction = `Avoid violating the [${ruleKey}] rule. Correction guidelines: ${suggestion}`;

    if (existing) {
      return await prisma.stylePatch.update({
        where: { id: existing.id },
        data: {
          violationCount: existing.violationCount + 1,
          promptInstruction,
          enabled: true, // Re-enable if disabled
        },
      });
    } else {
      return await prisma.stylePatch.create({
        data: {
          novelId,
          ruleKey,
          promptInstruction,
          violationCount: 1,
          enabled: true,
        },
      });
    }
  }

  /**
   * Resolves all active style patches for a given novel.
   */
  public async resolvePatches(novelId: string): Promise<any[]> {
    return await prisma.stylePatch.findMany({
      where: {
        novelId,
        enabled: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });
  }

  /**
   * Toggles the enabled state of a specific style patch.
   */
  public async togglePatch(id: string, enabled: boolean): Promise<any> {
    return await prisma.stylePatch.update({
      where: { id },
      data: { enabled },
    });
  }

  /**
   * Deletes a style patch by ID.
   */
  public async deletePatch(id: string): Promise<void> {
    await prisma.stylePatch.delete({
      where: { id },
    });
  }
}
