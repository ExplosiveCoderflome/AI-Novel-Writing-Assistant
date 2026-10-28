import type { PrismaClient } from "@prisma/client";
import type { PlannerLlmOptions } from "../plannerLlm";
import type { PlannerPlanQueryService } from "../query";
import type { ContextAssemblyService } from "../../novel/production/ContextAssemblyService";
import type { payoffLedgerSyncService } from "../../payoff/PayoffLedgerSyncService";
import type { characterDynamicsQueryService } from "../../novel/dynamics/CharacterDynamicsQueryService";

export interface PlannerOptions extends PlannerLlmOptions {
  taskStyleProfileId?: string;
}

export interface GenerateChapterPlanOptions extends PlannerOptions {
  replanContext?: {
    reason: string;
    triggerType: string;
    triggerReason?: string;
    windowReason?: string;
    whyTheseChapters?: string;
    sourceIssueIds: string[];
    windowIndex: number;
    windowSize: number;
    affectedChapterOrders: number[];
    anchorChapterOrder?: number | null;
    blockingLedgerKeys?: string[];
    replannedFromPlanId: string | null;
  };
}

export const plannerStoryModeSelect = {
  id: true,
  name: true,
  description: true,
  template: true,
  parentId: true,
  profileJson: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface ChapterPlanPreparationDependencies {
  db:Pick<PrismaClient,"novel"|"chapter"|"novelBible"|"plotBeat"|"chapterSummary"|"character"|"volumePlan"|"auditReport"|"creativeDecision"|"storyMacroPlan"|"stateChangeProposal">;
  readBookPlan:PlannerPlanQueryService["getBookPlan"];
  listArcPlans:PlannerPlanQueryService["listArcPlans"];
  resolveStyleSummary(novelId:string,chapterId?:string,taskStyleProfileId?:string):Promise<string>;
  readPayoff:typeof payoffLedgerSyncService.getPayoffLedger;
  readDynamics:typeof characterDynamicsQueryService.getOverview;
  buildStateContext:ContextAssemblyService["build"];
  strictSources?:boolean;
}
