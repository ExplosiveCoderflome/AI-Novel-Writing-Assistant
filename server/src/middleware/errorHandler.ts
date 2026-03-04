import type { NextFunction, Request, Response } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { ZodError } from "zod";

export class AppError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(message: string, statusCode = 500, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response<ApiResponse<null>>,
  _next: NextFunction,
): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: "请求参数校验失败。",
      message: error.issues.map((issue) => issue.message).join("; "),
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      message: typeof error.details === "string" ? error.details : undefined,
    });
    return;
  }

  const message = error instanceof Error ? error.message : "服务器发生未知错误。";
  res.status(500).json({
    success: false,
    error: message,
  });
}
