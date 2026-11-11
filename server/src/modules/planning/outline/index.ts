import { prisma } from "../../../db/prisma";
import { OutlineProjectService } from "./application/OutlineProjectService";
import { OutlineRepository } from "./infrastructure/OutlineRepository";
import { OutlineProposalService } from "./application/OutlineProposalService";
import { OutlineImportPreviewService } from "./application/OutlineImportPreviewService";
export * from "./domain/outlineDocument";
export * from "./domain/outlineDiff";
export * from "./domain/outlineImportEdits";
export * from "./application/OutlineTransferService";
export * from "./application/OutlineProjectService";
export const outlineProjectService = new OutlineProjectService(new OutlineRepository(prisma));
export const outlineProposalService = new OutlineProposalService(new OutlineRepository(prisma));
export const outlineImportPreviewService = new OutlineImportPreviewService(new OutlineRepository(prisma));
export * from "./application/OutlineProposalService";

export * from "./openBook";
import { OutlineOpenBookService } from "./openBook";
export const outlineOpenBookService = new OutlineOpenBookService(prisma);
