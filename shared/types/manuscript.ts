export type ManuscriptEncoding = "utf-8" | "utf-16le" | "utf-16be" | "gb18030";
export type ManuscriptNarrativeForm = "long_novel";
export type ManuscriptRange = { start: number; end: number };
export type ManuscriptUnitRole = "body" | "toc" | "front_matter" | "back_matter" | "other_reviewed";
export type ManuscriptSessionStatus = "uploaded" | "splitting" | "needs_review" | "ready_to_confirm" | "confirmed" | "failed" | "cancelled";
export type ManuscriptProposalStatus = "generating" | "pending" | "applied" | "rejected" | "stale" | "failed";

export interface ManuscriptPartitionUnit {
  draftId: string;
  range: ManuscriptRange;
  role: ManuscriptUnitRole;
  title: string;
  confidence?: number;
  needsReview: boolean;
}

export interface ManuscriptCoverage {
  sourceLength: number;
  coveredLength: number;
  coverageHash: string;
  complete: boolean;
  bodyUnitCount: number;
  attachmentUnitCount: number;
  unresolvedCount: number;
}

export interface ManuscriptImportRequest {
  title: string;
  narrativeForm: ManuscriptNarrativeForm;
  pastedText?: string;
  encoding?: ManuscriptEncoding;
  requestKey: string;
}

export interface ManuscriptFileUploadRequest extends Omit<ManuscriptImportRequest, "pastedText"> {
  fileBase64: string;
  fileName?: string;
}

export interface ManuscriptImportResponse {
  projectId: string;
  sourceId: string;
  sessionId: string;
  sourceHash: string;
  rawHash: string;
  encoding: ManuscriptEncoding;
  charCount: number;
  byteCount: number;
  status: ManuscriptSessionStatus;
}

export interface ManuscriptSplitRequest {
  expectedSessionVersion: number;
  sourceHash: string;
  mode: "rules" | "manual";
}

export interface ManuscriptPartitionRequest {
  expectedSessionVersion: number;
  sourceHash: string;
  units: ManuscriptPartitionUnit[];
}

export interface ManuscriptConfirmRequest {
  expectedSessionVersion: number;
  sourceHash: string;
  coverageHash: string;
  title: string;
  requestKey: string;
}

export interface ManuscriptWorkspaceUnit {
  id: string;
  chapterId: string | null;
  title: string;
  displayOrder: number;
  status: "active" | "inactive";
  workingRevision: number;
  contentHash: string;
  sourceRanges: ManuscriptRange[];
}

export interface ManuscriptApiError {
  code: string;
  message: string;
}

/** Server-authored context. Whole-book intentions are not runtime facts. */
export interface ManuscriptChapterRevisionContext {
 source:{sourceHash:string;unitId:string;ranges:Array<{start:number;end:number}>;originalText:string;excerpted:boolean};
 previousWorkingChapters:Array<{unitId:string;chapterId:string;contentHash:string;content:string;omittedPrefixCharCount:number}>;
 wholeBookPlanningConstraints:{label:"全书约束，不代表本章已经发生";baselineRevisionId:string;workingRevisionId:string;endingDirection:string;immutableFacts:Array<{title:string;content:string}>;currentChapterPlan:unknown};
 preserve:{coreFacts:true;identity:true;causality:true;pov:true;ending:true};
}
