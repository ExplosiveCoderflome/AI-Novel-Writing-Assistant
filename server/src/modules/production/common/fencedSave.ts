export interface ContentVersionFence { version: string | number; userEditedAt: string | null }
export class ProtectedProductionContentError extends Error {
  constructor() { super("人工编辑的正文需要明确发起修订，不能被自动生产覆盖。"); this.name = "ProtectedProductionContentError"; }
}
export class ProductionVersionConflictError extends Error {
  constructor() { super("正文版本已变化，请从作品页重新确认。"); this.name = "ProductionVersionConflictError"; }
}

export async function saveWithFence<T, R>(input: {
  expected: ContentVersionFence;
  value: T;
  purpose: "automatic" | "user_requested";
  fence: () => Promise<void>;
  /** Must check version, edit marker and durable ownership atomically with the write. */
  compareAndSave: (input: { expected: ContentVersionFence; value: T }) => Promise<{ saved: true; value: R } | { saved: false }>;
}): Promise<R> {
  await input.fence();
  if (input.purpose === "automatic" && input.expected.userEditedAt !== null) throw new ProtectedProductionContentError();
  const result = await input.compareAndSave({ expected: input.expected, value: input.value });
  if (!result.saved) throw new ProductionVersionConflictError();
  await input.fence();
  return result.value;
}
