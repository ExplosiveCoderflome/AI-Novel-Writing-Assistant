import {
  createNovelApplicationServices,
} from "./application/NovelApplicationServices";
import {
  novelApplicationServiceMethodNames,
  type NovelApplicationServices,
} from "./application/NovelApplicationContracts";

/**
 * @deprecated Prefer injecting the specific capability from
 * `createNovelApplicationServices()` instead of depending on the full
 * compatibility facade.
 */
export class NovelService {
  private readonly applicationServices: NovelApplicationServices;

  constructor(applicationServices: NovelApplicationServices = createNovelApplicationServices()) {
    this.applicationServices = applicationServices;
  }

  get core() {
    return (this.applicationServices as unknown as { core: unknown }).core;
  }

  set core(value: unknown) {
    (this.applicationServices as unknown as { core: unknown }).core = value;
  }

  get qualityRepairCoordinator() {
    return (this.applicationServices as unknown as { qualityRepairCoordinator: unknown }).qualityRepairCoordinator;
  }

  set qualityRepairCoordinator(value: unknown) {
    (this.applicationServices as unknown as { qualityRepairCoordinator: unknown }).qualityRepairCoordinator = value;
  }
}

export interface NovelService extends NovelApplicationServices {}

for (const methodName of novelApplicationServiceMethodNames) {
  (NovelService.prototype as unknown as Record<string, unknown>)[methodName] = function delegateNovelApplicationMethod(
    this: NovelService,
    ...args: unknown[]
  ) {
    const { applicationServices } = this as unknown as { applicationServices: NovelApplicationServices };
    const method = applicationServices[methodName] as (...methodArgs: unknown[]) => unknown;
    return method.apply(applicationServices, args);
  };
}
