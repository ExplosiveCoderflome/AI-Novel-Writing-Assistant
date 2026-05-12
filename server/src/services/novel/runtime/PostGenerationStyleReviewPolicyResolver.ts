import { prisma } from "../../../db/prisma";

export interface PostGenerationStyleReviewPolicy {
  enabled: boolean;
}

export class PostGenerationStyleReviewPolicyResolver {
  async resolve(novelId: string): Promise<PostGenerationStyleReviewPolicy> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: { postGenerationStyleReviewEnabled: true },
    });

    return {
      enabled: novel?.postGenerationStyleReviewEnabled ?? true,
    };
  }
}
