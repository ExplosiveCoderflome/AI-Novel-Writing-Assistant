import { ContextResolverRegistry } from "./ContextResolverRegistry";
import { createCreativeHubContextResolvers } from "./creativeHubContextResolvers";

export function createDefaultContextResolverRegistry(): ContextResolverRegistry {
  const registry = new ContextResolverRegistry();
  for (const resolver of createCreativeHubContextResolvers()) {
    registry.register(resolver);
  }
  return registry;
}
