import type { NovelApplicationServices } from "./NovelApplicationContracts";
import { createNovelApplicationServices } from "./NovelApplicationServices";

let sharedNovelServices: NovelApplicationServices | null = null;

/**
 * Returns the process-level application capability singleton.
 *
 * Production code should use this entrypoint instead of calling
 * createNovelApplicationServices() directly, so global stage runners and
 * runtime caches are not recreated by each route, task, or event consumer.
 */
export function getSharedNovelServices(): NovelApplicationServices {
  if (!sharedNovelServices) {
    sharedNovelServices = createNovelApplicationServices();
  }
  return sharedNovelServices;
}

export function _resetSharedNovelServicesForTest(): void {
  sharedNovelServices = null;
}
