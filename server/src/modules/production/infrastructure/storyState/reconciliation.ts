import { canonicalProductionJson, cloneProductionData, isKnownPromptQualityFailure, isRetryableModelOutputError, ProductionBudgetNotDispatchedError, type ProductionJson } from "../../common";
import { hashProductionContent, InvalidProductionRequestError } from "../../application";
import { ARTIFACT_CONSUMERS, type ArtifactContext, type ArtifactExtractionPort, type ArtifactReconciliationPorts, type ArtifactStepIdentity } from "./consumerPorts";
import { prepareArtifactRequest } from "./preparedRequest";

export interface ArtifactReconciliationOutcome {
  status: "completed" | "degraded" | "pending" | "unknown" | "budget_exhausted" | "failed";
  reason?: string;
  results?: ProductionJson;
}
function identity(context: ArtifactContext, step: string, fingerprint: string, kind: ArtifactStepIdentity["kind"]): ArtifactStepIdentity {
  return { runId: context.run.id, ownerKey: context.run.ownerKey, novelId: context.run.progress.unit.novelId,
    chapterId: context.run.progress.unit.chapterId, contentHash: context.contentHash,
    unitRequestKey: context.requestKey, stepKey: hashProductionContent(canonicalProductionJson({ requestKey: context.requestKey,
      fingerprint, step, contentHash: context.contentHash, snapshots: context.run.snapshots })),
    step, executionToken: context.executionToken, kind };
}

async function modelStep(context: ArtifactContext, ports: ArtifactReconciliationPorts, extraction: ArtifactExtractionPort,
  step: string, recoverOnly: boolean): Promise<{ status: "completed"; value: ProductionJson; stepKey: string } | ArtifactReconciliationOutcome> {
  const prepared = await extraction.prepare(context);
  if (!prepared.inputFingerprint || !Number.isSafeInteger(prepared.outputTokens) || prepared.outputTokens < 1) {
    throw new InvalidProductionRequestError("Artifact extraction requires a complete input fingerprint and output budget");
  }
  const stepIdentity = identity(context, step, prepared.inputFingerprint, "model");
  const claimed = await ports.checkpoints.claim(stepIdentity, { existingOnly: recoverOnly });
  if (claimed.status === "cached") return { status: "completed", value: extraction.validate(claimed.value), stepKey: stepIdentity.stepKey };
  if (claimed.status !== "claimed") return { status: claimed.status === "unknown" ? "unknown" : "pending", reason: `${step}_not_resolved` };
  if (!await ports.reserve(context, stepIdentity.stepKey, prepared.outputTokens)) {
    await ports.fence(context);
    await ports.checkpoints.release(claimed.claim);
    return { status: "budget_exhausted", reason: `${step}_budget_denied` };
  }
  await ports.fence(context);
  let value: ProductionJson;
  try { value = extraction.validate(await extraction.invoke(context, prepared, stepIdentity.stepKey)); }
  catch (error) {
    if (error instanceof ProductionBudgetNotDispatchedError) {
      await ports.fence(context);
      await ports.checkpoints.release(claimed.claim);
      return { status: "budget_exhausted", reason: `${step}_budget_denied` };
    }
    if (isRetryableModelOutputError(error) || isKnownPromptQualityFailure(error)) {
      // The model answered but its output could not be used, and the extraction
      // port wrote nothing for this call. Structured parse failures and a
      // post-validation semantic rejection are both known outcomes. Release the
      // claim so an explicit execution can run the step again; anything else
      // stays unknown.
      await ports.fence(context);
      await ports.checkpoints.release(claimed.claim);
      return { status: "pending", reason: `${step}_output_unusable` };
    }
    return { status: "unknown", reason: `${step}_outcome_unknown` };
  }
  await ports.fence(context);
  await ports.checkpoints.succeed(claimed.claim, value);
  return { status: "completed", value, stepKey: stepIdentity.stepKey };
}

/** Owns extraction and consumer recovery, never old pipeline dispatch or task commands. */
export async function reconcileArtifacts(context: ArtifactContext, ports: ArtifactReconciliationPorts,
  options: { recoverOnly?: boolean } = {}): Promise<ArtifactReconciliationOutcome> {
  if (context.run.activeStage !== "reconcile" || context.run.activeRequestKey !== context.requestKey
    || context.contentHash !== context.run.progress.committedContentHash
    || hashProductionContent(context.content) !== context.contentHash || !context.executionToken) {
    throw new InvalidProductionRequestError("Reconciliation requires the current committed manuscript and stage claim");
  }
  await ports.fence(context);
  const extracted = await modelStep(context, ports, ports.extraction, "extraction", options.recoverOnly === true);
  if (!("value" in extracted)) return extracted;
  let output = extracted.value;
  await ports.fence(context);
  if (ports.prepareCandidates) {
    // This caller-bound operation is idempotent and may refresh explicit human confirmations on resume.
    output = await ports.prepareCandidates(context, cloneProductionData(output));
    await ports.fence(context);
  }
  const fingerprint = hashProductionContent(canonicalProductionJson({ extraction: extracted.stepKey, output }));
  const previous: Record<string, ProductionJson> = {};
  for (const consumer of ARTIFACT_CONSUMERS) {
    const stepIdentity = identity(context, consumer, fingerprint, "consumer");
    await ports.fence(context);
    const claimed = await ports.checkpoints.claim(stepIdentity);
    if (claimed.status === "cached") { previous[consumer] = claimed.value; continue; }
    if (claimed.status !== "claimed") return { status: claimed.status === "exhausted" ? "failed" : "pending", reason: `consumer_pending:${consumer}` };
    try {
      const result = await ports.consumers[consumer].apply({ context, output: cloneProductionData(output), previous: cloneProductionData(previous), stepKey: stepIdentity.stepKey, claim: claimed.claim });
      await ports.fence(context);
      await ports.checkpoints.succeed(claimed.claim, result);
      previous[consumer] = result;
    } catch (error) {
      // A changed manuscript/lease must still propagate, not become a retryable write failure.
      await ports.fence(context);
      await ports.checkpoints.fail(claimed.claim);
      return { status: "pending", reason: `consumer_failed:${consumer}` };
    }
  }
  let degraded = false;
  if (context.run.snapshots.profile.capabilities.includes("causal_closure") || ports.timeline) {
    if (!ports.timeline) return { status: "pending", reason: "timeline_boundary_required" };
    const timelinePort = await prepareArtifactRequest(context, ports, ports.timeline.extraction,
      identity(context, "prepare_timeline_extraction", fingerprint, "consumer"));
    if (!timelinePort) return { status: "pending", reason: "timeline_input_pending" };
    const timeline = await modelStep(context, ports, timelinePort, "timeline_extraction", options.recoverOnly === true);
    if (!("value" in timeline)) return timeline;
    const stepIdentity = identity(context, "timeline_boundary", hashProductionContent(canonicalProductionJson({ step: timeline.stepKey, value: timeline.value })), "consumer");
    const claimed = await ports.checkpoints.claim(stepIdentity);
    if (claimed.status === "cached") previous.timeline_boundary = claimed.value;
    else if (claimed.status !== "claimed") return { status: claimed.status === "exhausted" ? "failed" : "pending", reason: "timeline_boundary_pending" };
    else {
      try {
        await ports.fence(context);
        const result = await ports.timeline.consumer.apply({ context, output: timeline.value, previous, stepKey: stepIdentity.stepKey, claim: claimed.claim });
        await ports.fence(context);
        await ports.checkpoints.succeed(claimed.claim, result);
        previous.timeline_boundary = result;
      } catch {
        await ports.fence(context);
        await ports.checkpoints.fail(claimed.claim);
        return { status: "pending", reason: "timeline_boundary_failed" };
      }
    }
    const boundary = previous.timeline_boundary;
    degraded = boundary !== null && typeof boundary === "object" && !Array.isArray(boundary) && boundary.syncMode === "degraded";
  }
  const record = output !== null && typeof output === "object" && !Array.isArray(output) ? output : {};
  const syncPlan = record.syncPlan !== null && typeof record.syncPlan === "object" && !Array.isArray(record.syncPlan) ? record.syncPlan : {};
  if (context.run.snapshots.profile.reconcile === "strict" || record.requiresFullReconcile === true || syncPlan.payoffLedger === "full_reconcile") {
    if (!ports.fullReconcile) return { status: "pending", reason: "full_reconcile_required" };
    const fullContext = { ...context, extraction: output };
    const preparedFull = await prepareArtifactRequest(fullContext, ports, ports.fullReconcile,
      identity(context, "prepare_payoff_full_reconcile", fingerprint, "consumer"));
    if (!preparedFull) return { status: "pending", reason: "full_reconcile_input_pending" };
    const full = await modelStep(fullContext, ports, preparedFull, "payoff_full_reconcile", options.recoverOnly === true);
    if (!("value" in full)) return full;
    if (!ports.fullReconcileConsumer) return { status: "pending", reason: "full_reconcile_commit_required" };
    const commitIdentity = identity(context, "payoff_full_commit", hashProductionContent(canonicalProductionJson({ step: full.stepKey, value: full.value })), "consumer");
    const commit = await ports.checkpoints.claim(commitIdentity);
    if (commit.status === "cached") previous.payoff_full_reconcile = commit.value;
    else if (commit.status !== "claimed") return { status: commit.status === "exhausted" ? "failed" : "pending", reason: "full_reconcile_commit_pending" };
    else {
      try {
        const result = await ports.fullReconcileConsumer.apply({ context, output: full.value, previous, stepKey: commitIdentity.stepKey, claim: commit.claim });
        await ports.fence(context);
        await ports.checkpoints.succeed(commit.claim, result);
        previous.payoff_full_reconcile = result;
      } catch {
        await ports.fence(context);
        await ports.checkpoints.fail(commit.claim);
        return { status: "pending", reason: "full_reconcile_commit_failed" };
      }
    }
  }
  return { status: degraded ? "degraded" : "completed", results: previous };
}
