export interface PostGenerationStyleReviewInput {
  /** Book-level switch snapshot. The kernel only calls the port when this is true and a port is installed. */
  enabled: boolean;
  novelId: string;
  chapterId: string;
  order: number;
  content: string;
  /** Continuation constraints carried by the prepared context package. */
  continuationConstraints: readonly string[];
  taskStyleProfileId?: string;
  provider?: string;
  model?: string;
}

export type PostGenerationStyleReviewVerdict =
  | { status: "pass" }
  | { status: "fail"; code: string; reason: string };

export interface PostGenerationStyleReviewPort {
  review(input: PostGenerationStyleReviewInput): Promise<PostGenerationStyleReviewVerdict>;
}

export class PostGenerationStyleReviewRejectedError extends Error {
  readonly reason: string;
  constructor(readonly code: string, reason: string, readonly contentHash: string) {
    super(reason);
    this.name = "PostGenerationStyleReviewRejectedError";
    this.reason = reason;
  }
}

/**
 * TODO(P1-3): replace with a real PostGenerationStyleReviewRunner adapter.
 * The full runner still needs kernel request budgeting, lease/CAS fencing and a
 * selection-policy-aligned rejection rule before it can be installed by default.
 * Runtime composition never installs a port, so a book switch alone cannot call it.
 */
export function createPostGenerationStyleReviewStub(): PostGenerationStyleReviewPort {
  return { review: async () => ({ status: "pass" }) };
}
