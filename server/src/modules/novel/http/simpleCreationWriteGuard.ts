import type { NextFunction, Request, Response } from "express";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";

export function isSimpleCreationWriteAllowed(method: string, path: string): boolean {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return true;
  }
  const normalizedPath = path.toLowerCase();
  return normalizedPath.endsWith("/creation-experience/professional")
    || normalizedPath.includes("/export");
}

export async function guardSimpleCreationUserWrites(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (isSimpleCreationWriteAllowed(req.method, req.path)) {
      next();
      return;
    }
    const novelId = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!novelId) {
      next();
      return;
    }
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: { creationExperience: true },
    });
    if (novel?.creationExperience === "simple") {
      next(new AppError(
        "简易创作项目由 AI 自动完成，当前内容仅供阅读。如需修改，请先转为专业创作。",
        409,
      ));
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
