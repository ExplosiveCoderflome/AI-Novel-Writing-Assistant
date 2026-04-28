import type { ContextResolverSummary, PromptContextResolver } from "./types";

export class ContextResolverRegistry {
  private readonly resolvers = new Map<string, PromptContextResolver>();

  register(resolver: PromptContextResolver): this {
    if (this.resolvers.has(resolver.group)) {
      throw new Error(`Duplicate prompt context resolver: ${resolver.group}`);
    }
    this.resolvers.set(resolver.group, resolver);
    return this;
  }

  get(group: string): PromptContextResolver | null {
    return this.resolvers.get(group) ?? null;
  }

  list(): ContextResolverSummary[] {
    return [...this.resolvers.values()]
      .map((resolver) => ({
        group: resolver.group,
        description: resolver.description,
      }))
      .sort((left, right) => left.group.localeCompare(right.group));
  }
}
