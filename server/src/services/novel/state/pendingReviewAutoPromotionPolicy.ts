export const PENDING_REVIEW_AUTO_PROMOTION_ELIGIBLE_AFTER_DAYS = 14;
export const PENDING_REVIEW_AUTO_PROMOTION_RUN_LIMIT = 50;
export const PENDING_REVIEW_AUTO_PROMOTION_SCAN_LIMIT = 1000;

export const PENDING_REVIEW_AUTO_PROMOTION_PROPOSAL_TYPES = [
  "relation_state_update",
  "information_disclosure",
] as const;

export type PendingReviewAutoPromotionProposalType =
  typeof PENDING_REVIEW_AUTO_PROMOTION_PROPOSAL_TYPES[number];

