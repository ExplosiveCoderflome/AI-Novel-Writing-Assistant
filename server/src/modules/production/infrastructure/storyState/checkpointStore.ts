import type { Prisma, PrismaClient } from "@prisma/client";
import type { ArtifactStepIdentity } from "./consumerPorts";
import { PrismaProductionCheckpointStore } from "../checkpoints";
import { assertArtifactOwnership } from "./persistence/ownership";
/** Reconciliation retains its committed-manuscript guard. */
export class PrismaArtifactCheckpointStore extends PrismaProductionCheckpointStore {
  constructor(db: PrismaClient, assertOwnership: (tx: Prisma.TransactionClient, identity: ArtifactStepIdentity) => Promise<void>) {
    super(db, (tx, identity) => assertArtifactOwnership(tx, identity, assertOwnership), "reconcile");
  }
}
