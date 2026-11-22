import type { Prisma } from "@prisma/client";
import { AppError } from "../../../../middleware/errorHandler";
import type { RunContract } from "../../../../modules/director";
import { assertNovelDirectorVersion, readRunExecutionEpoch } from "../../../../modules/novel/director-routing";
import { requireLaunch } from "../../productionInputs";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../../../db/prisma";
import { streamAgentReply } from "../../../../modules/agentConversation";
import {
  id,
  addressSchema,
  ReviewConversation,
  type ReviewSubject,
  type DiscussionSubject,
  type DiscussionContext,
  type Address,
} from "./ReviewConversation";
export type { Address } from "./ReviewConversation";

export function reviewConversationRouter<F extends string, R extends { base: Record<F, string> }>(
  route: string,
  subject: ReviewSubject<F, R>,
) {
  return fieldDiscussionRouter(
    route,
    addressSchema,
    subject,
    (a: Address) => {
      return JSON.stringify([
        subject.scope,
        a.novelId,
        a.runId,
        a.version,
        ...(a.planVersionId ? [a.planVersionId] : []),
        ...(a.bodyHash ? [a.bodyHash] : []),
        a.resourceId,
      ]);
    },
    async (db, a) => {
      const row = await db.directorNextRunControl.findUnique({ where: { runId: a.runId }, include: { run: true } });
      if (
        !row ||
        row.novelId !== a.novelId ||
        row.run.novelId !== a.novelId ||
        row.version !== a.version ||
        row.status !== "waiting_gate" ||
        !z
          .object({ artifactTypes: z.tuple([z.literal(subject.artifact)]) })
          .safeParse(JSON.parse(row.gateJson ?? "null")).success
      ) {
        throw new AppError("确认阶段有变化，请重新打开本书导演台。", 409);
      }
      const contract = JSON.parse(row.run.contractJson) as RunContract;
      if (contract.novelId !== a.novelId || contract.runId !== a.runId)
        throw new AppError("无法核对本书确认记录。", 409);
      await assertNovelDirectorVersion(a.novelId, "v2", readRunExecutionEpoch(row.run.contractJson), db);
      const launch = contract.launchInput;
      return {
        resource: await subject.read(db, a, contract),
        storyInput: launch?.storyInput ?? "",
        validateSend: () => {
          requireLaunch(contract);
        },
        runId: a.runId,
        options: {
          novelId: a.novelId,
          taskId: a.runId,
          stage: subject.stage,
          entrypoint: "director_next",
          provider: contract.modelConfig?.route,
          model: contract.modelConfig?.model,
          temperature: launch?.temperature,
        },
      };
    },
  );
}
export function fieldDiscussionRouter<
  F extends string,
  R extends { base: Record<F, string> },
  A extends { novelId: string },
>(
  route: string,
  address: { parse: (input: unknown) => A },
  subject: DiscussionSubject<F, R>,
  scope: (a: A) => string,
  read: (db: Prisma.TransactionClient, a: A) => Promise<DiscussionContext<R>>,
) {
  const service = new ReviewConversation(prisma, subject, scope, read);
  const messageSchema = z
    .object({
      requestText: z.string().trim().min(1).max(4000),
      requestId: id,
      parentResultId: id.optional(),
      base: subject.draft,
      draft: subject.draft,
    })
    .strict();
  const router = Router();
  router.get(route, async (req, res) => {
    res.json({ success: true, data: await service.history(address.parse(req.params)) });
  });
  router.post(`${route}/turns`, async (req, res) => {
    const receipt = await service.send(address.parse(req.params), messageSchema.parse(req.body));
    res.status(202).json({ success: true, data: receipt });
  });
  router.get(`${route}/turns/:id/stream`, async (req, res) => {
    streamAgentReply(res, req.params.id, await service.turnStatus(address.parse(req.params), req.params.id));
  });
  router.post(`${route}/turns/:id/interrupt`, async (req, res) => {
    await service.interrupt(address.parse(req.params), req.params.id);
    res.json({ success: true });
  });
  return router;
}
