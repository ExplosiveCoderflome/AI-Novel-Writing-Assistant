import { prisma } from "../../../db/prisma";
import { OutlineProjectService } from "./application/OutlineProjectService";
import { OutlineRepository } from "./infrastructure/OutlineRepository";
export * from "./domain/outlineDocument";
export * from "./domain/outlineDiff";
export * from "./application/OutlineTransferService";
export * from "./application/OutlineProjectService";
export const outlineProjectService = new OutlineProjectService(new OutlineRepository(prisma));
