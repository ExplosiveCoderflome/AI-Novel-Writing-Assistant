import type { NextFunction, Request, Response } from "express";

export function authMiddleware(_req: Request, _res: Response, next: NextFunction): void {
  next();
}
