import type {Prisma} from "@prisma/client";
import type {RunContract} from "../../domain";

/** Business recovery participates in the command transaction; polling cannot invoke it. */
export type BusinessResume = (contract: RunContract, tx: Prisma.TransactionClient) => Promise<void>;

export async function commitExplicitResume(tx: Prisma.TransactionClient, contract: RunContract, commandId: string, resumeBusiness?: BusinessResume) {
  await resumeBusiness?.(contract, tx);
  const latest = await tx.directorNextEvent.findFirst({where: {runId: contract.runId}, orderBy: {seq: "desc"}, select: {seq: true}});
  const stop = await tx.directorNextEvent.findFirst({where: {runId: contract.runId, type: "stop_signal"}, orderBy: {seq: "desc"}, select: {seq: true}});
  if (!stop) return;
  const seq = (latest?.seq ?? 0) + 1;
  await tx.directorNextEvent.create({data: {id: `${contract.runId}:${seq}`, runId: contract.runId, seq, type: "stop_signal_cleared", payloadJson: JSON.stringify({signalSeq: stop.seq, commandId})}});
}
