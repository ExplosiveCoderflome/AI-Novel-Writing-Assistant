import type {
  PayoffLedgerSourceRef,
  PayoffLedgerStatus,
} from "@ai-novel/shared/types/payoffLedger";

const BOOK_CONTRACT_REF_PREFIX = "book_contract.";

interface SourceBoundLedgerItem {
  ledgerKey: string;
  currentStatus: PayoffLedgerStatus;
  sourceRefs: PayoffLedgerSourceRef[];
}

interface ResolvedLedgerItem {
  ledgerKey: string;
  sourceRefs: PayoffLedgerSourceRef[];
}

export interface ResolveSupersededBookContractLedgerKeysInput {
  existingItems: SourceBoundLedgerItem[];
  resolvedItems: ResolvedLedgerItem[];
  activeBookContractRefIds: string[];
}

function readBookContractRefId(source: PayoffLedgerSourceRef): string | null {
  const refId = source.refId?.trim() ?? "";
  return source.kind === "major_payoff" && refId.startsWith(BOOK_CONTRACT_REF_PREFIX)
    ? refId
    : null;
}

function isTerminal(status: PayoffLedgerStatus): boolean {
  return status === "paid_off" || status === "failed";
}

export function resolveSupersededBookContractLedgerKeys(
  input: ResolveSupersededBookContractLedgerKeysInput,
): Set<string> {
  const activeRefIds = new Set(input.activeBookContractRefIds);
  const resolvedKeys = new Set(input.resolvedItems.map((item) => item.ledgerKey));
  const resolvedOwnerByRefId = new Map<string, string>();

  for (const item of input.resolvedItems) {
    for (const source of item.sourceRefs) {
      const refId = readBookContractRefId(source);
      if (refId) {
        resolvedOwnerByRefId.set(refId, item.ledgerKey);
      }
    }
  }

  const supersededKeys = new Set<string>();
  for (const item of input.existingItems) {
    if (isTerminal(item.currentStatus) || resolvedKeys.has(item.ledgerKey) || item.sourceRefs.length === 0) {
      continue;
    }
    const bookContractRefIds = item.sourceRefs
      .map(readBookContractRefId)
      .filter((refId): refId is string => Boolean(refId));
    if (bookContractRefIds.length !== item.sourceRefs.length) {
      continue;
    }
    const allSourcesRetiredOrReassigned = bookContractRefIds.every((refId) => (
      !activeRefIds.has(refId)
      || resolvedOwnerByRefId.get(refId) !== item.ledgerKey
    ));
    if (allSourcesRetiredOrReassigned) {
      supersededKeys.add(item.ledgerKey);
    }
  }
  return supersededKeys;
}
