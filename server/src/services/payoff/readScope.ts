import {AsyncLocalStorage} from "node:async_hooks";

const readScope = new AsyncLocalStorage<boolean>();

/** Preparation may consume a saved ledger, but automatic synchronization belongs to reconciliation. */
export function withPayoffLedgerReadScope<T>(operation: () => Promise<T>): Promise<T> {
  return readScope.run(true, operation);
}

export function payoffLedgerReadOnly(): boolean {
  return readScope.getStore() === true;
}
