import type { Express } from "express";
import { createDirectorNextRouter, type DirectorNextHttpDeps } from "./routes";

export function mountDirectorNext(app: Express, deps: DirectorNextHttpDeps): void {
  app.use("/api/director-next", createDirectorNextRouter(deps));
}

export * from "./routes";
export {LegacyRunProjection} from "../legacy";
