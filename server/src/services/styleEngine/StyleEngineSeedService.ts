import {
  seedStyleEngineStarterData,
  type StyleEngineSeedReport,
  type SystemResourceSeedMode,
} from "../bootstrap/SystemResourceBootstrapService";

let defaultSeedPromise: Promise<StyleEngineSeedReport> | null = null;

export async function ensureStyleEngineSeedData(
  mode: SystemResourceSeedMode = "missing_only",
): Promise<StyleEngineSeedReport> {
  if (mode !== "missing_only") {
    return seedStyleEngineStarterData(mode);
  }

  if (!defaultSeedPromise) {
    defaultSeedPromise = seedStyleEngineStarterData(mode).catch((error) => {
      defaultSeedPromise = null;
      throw error;
    });
  }

  return defaultSeedPromise;
}
