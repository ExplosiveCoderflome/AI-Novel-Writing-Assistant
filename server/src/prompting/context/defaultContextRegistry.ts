import { ContextResolverRegistry } from "./ContextResolverRegistry";
import { createCreativeHubContextResolvers } from "./creativeHubContextResolvers";
import { createRuntimeContextResolvers } from "./runtimeContextResolvers";

export function createDefaultContextResolverRegistry(): ContextResolverRegistry {
  const registry = new ContextResolverRegistry();
  for (const resolver of [
    ...createCreativeHubContextResolvers(),
    ...createRuntimeContextResolvers(),
  ]) {
    registry.register(resolver);
  }
  return registry;
}
