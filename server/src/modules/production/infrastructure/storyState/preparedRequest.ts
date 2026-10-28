import { cloneProductionData, type ProductionJson } from "../../common";
import { InvalidProductionRequestError } from "../../application";
import type { ArtifactContext, ArtifactExtractionPort, ArtifactReconciliationPorts,
  ArtifactStepIdentity, PreparedArtifactExtraction } from "./consumerPorts";

function validate(value: unknown): PreparedArtifactExtraction {
  const prepared = value as PreparedArtifactExtraction | null;
  if (!prepared?.inputFingerprint || !Number.isSafeInteger(prepared.outputTokens) || prepared.outputTokens < 1 || prepared.input === undefined) {
    throw new InvalidProductionRequestError("Prepared artifact request checkpoint is invalid");
  }
  return cloneProductionData(prepared);
}

/** Freeze the read-only input before claiming a paid request. A changed live ledger cannot create a second request. */
export async function prepareArtifactRequest(context: ArtifactContext, ports: ArtifactReconciliationPorts,
  port: ArtifactExtractionPort, identity: ArtifactStepIdentity): Promise<ArtifactExtractionPort | undefined> {
  const claimed = await ports.checkpoints.claim(identity);
  let prepared: PreparedArtifactExtraction;
  if (claimed.status === "cached") prepared = validate(claimed.value);
  else if (claimed.status !== "claimed") return undefined;
  else {
    try {
      await ports.fence(context);
      prepared = validate(await port.prepare(context));
      await ports.fence(context);
      await ports.checkpoints.succeed(claimed.claim, prepared as unknown as ProductionJson);
    } catch (error) {
      await ports.fence(context);
      await ports.checkpoints.fail(claimed.claim);
      throw error;
    }
  }
  return { ...port, prepare: async () => cloneProductionData(prepared) };
}
