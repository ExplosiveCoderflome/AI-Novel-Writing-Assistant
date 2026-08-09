const GATED_ROUTE_PREFIXES = [
  "/novels/auto-director",
  "/creative-hub",
  "/book-analysis",
  "/style-engine",
  "/worlds/generator",
];

interface AutomaticSetupPromptInput {
  statusResolved: boolean;
  readyForCreation: boolean;
  dismissed: boolean;
}

interface RouteSetupPromptInput {
  statusResolved: boolean;
  readyForCreation: boolean;
  pathname: string;
}

interface FirstNovelHandoffInput {
  configurationSucceeded: boolean;
  forceConfiguration: boolean;
}

export function shouldOpenAutomaticSetupPrompt(input: AutomaticSetupPromptInput): boolean {
  return input.statusResolved && !input.readyForCreation && !input.dismissed;
}

export function shouldOpenSetupPromptForRoute(input: RouteSetupPromptInput): boolean {
  return input.statusResolved
    && !input.readyForCreation
    && GATED_ROUTE_PREFIXES.some((prefix) => input.pathname.startsWith(prefix));
}

export function shouldShowFirstNovelHandoff(input: FirstNovelHandoffInput): boolean {
  return input.configurationSucceeded && !input.forceConfiguration;
}
