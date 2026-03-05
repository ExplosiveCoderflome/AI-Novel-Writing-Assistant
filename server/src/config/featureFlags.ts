function isEnabled(rawValue: string | undefined, defaultValue: boolean): boolean {
  if (!rawValue) {
    return defaultValue;
  }
  const normalized = rawValue.trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(normalized);
}

export const featureFlags = {
  worldWizardEnabled: isEnabled(process.env.WORLD_WIZARD_ENABLED, true),
  worldVisEnabled: isEnabled(process.env.WORLD_VIS_ENABLED, true),
  worldGraphEnabled: isEnabled(process.env.WORLD_GRAPH_ENABLED, false),
};

