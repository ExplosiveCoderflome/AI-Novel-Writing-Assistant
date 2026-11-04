import {AsyncLocalStorage} from "node:async_hooks";

const readScope = new AsyncLocalStorage<boolean>();

/** Production-kernel preparation may consume the saved story world slice, but slice regeneration belongs to planning and world flows whose model requests are registered with the kernel. */
export function withStoryWorldSliceReadScope<T>(operation: () => Promise<T>): Promise<T> {
  return readScope.run(true, operation);
}

export function storyWorldSliceReadOnly(): boolean {
  return readScope.getStore() === true;
}

/** A stale slice may only trigger regeneration outside read-only scopes; inside them the saved slice is reused as-is. */
export function shouldGenerateStoryWorldSlice(stale: boolean): boolean {
  return stale && !storyWorldSliceReadOnly();
}
