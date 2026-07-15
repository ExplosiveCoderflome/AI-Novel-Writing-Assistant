export interface BookContractPayoffValues {
  chapter3Payoff?: string | null;
  chapter10Payoff?: string | null;
  chapter30Payoff?: string | null;
}

export interface BookContractPayoffSource {
  refId: string;
  refLabel: string;
  payoff: string;
  targetStartChapterOrder: number;
  targetEndChapterOrder: number;
}

const BOOK_CONTRACT_PAYOFF_WINDOWS = [
  {
    field: "chapter3Payoff",
    refId: "book_contract.chapter3Payoff",
    refLabel: "Book Contract 第 3 章阶段回报",
    targetStartChapterOrder: 1,
    targetEndChapterOrder: 3,
  },
  {
    field: "chapter10Payoff",
    refId: "book_contract.chapter10Payoff",
    refLabel: "Book Contract 第 10 章阶段回报",
    targetStartChapterOrder: 4,
    targetEndChapterOrder: 10,
  },
  {
    field: "chapter30Payoff",
    refId: "book_contract.chapter30Payoff",
    refLabel: "Book Contract 第 30 章阶段回报",
    targetStartChapterOrder: 11,
    targetEndChapterOrder: 30,
  },
] as const;

function normalizePayoff(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

export function buildBookContractPayoffSources(
  values: BookContractPayoffValues | null | undefined,
): BookContractPayoffSource[] {
  if (!values) {
    return [];
  }
  return BOOK_CONTRACT_PAYOFF_WINDOWS.flatMap((window) => {
    const payoff = normalizePayoff(values[window.field]);
    return payoff
      ? [{
          refId: window.refId,
          refLabel: window.refLabel,
          payoff,
          targetStartChapterOrder: window.targetStartChapterOrder,
          targetEndChapterOrder: window.targetEndChapterOrder,
        }]
      : [];
  });
}

export function hasBookContractPayoffChanges(
  previous: BookContractPayoffValues | null | undefined,
  next: BookContractPayoffValues,
): boolean {
  if (!previous) {
    return buildBookContractPayoffSources(next).length > 0;
  }
  return BOOK_CONTRACT_PAYOFF_WINDOWS.some((window) => (
    normalizePayoff(previous[window.field]) !== normalizePayoff(next[window.field])
  ));
}
