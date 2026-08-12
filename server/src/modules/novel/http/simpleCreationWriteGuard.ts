import type { NextFunction, Request, Response } from "express";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";

export function isSimpleCreationWriteAllowed(method: string, path: string): boolean {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return true;
  }
  const normalizedPath = path.toLowerCase();
  return /\/creation-experience\/(simple|professional)$/.test(normalizedPath)
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
        "简易模式项目当前仅供阅读。如需修改，请先切换到专业模式。",
        409,
      ));
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
