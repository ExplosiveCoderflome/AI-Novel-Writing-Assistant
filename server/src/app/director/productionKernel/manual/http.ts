import {Router} from "express";
import type {ZodTypeAny} from "zod";
import {AIMessageChunk} from "@langchain/core/messages";
import {authMiddleware} from "../../../../middleware/auth";
import {validate} from "../../../../middleware/validate";
import {streamToSSE} from "../../../../llm/streaming";
import {chapterRuntimeRequestSchema} from "../../../../services/novel/runtime/chapterRuntimeSchema";
import {chapterParamsSchema, repairSchema, reviewSchema} from "../../../../modules/novel/http/novelHttpSchemas";
import type {createManualChapterEntry} from "./entry";
import type {ManualChapterOperation} from "./contract";

/** Install before the frozen novel routes. Falling through invokes exactly their existing handler. */
export function createManualChapterRouter(entry: ReturnType<typeof createManualChapterEntry>): Router {
  const router = Router();
  const routes: Array<{path: string; operation: ManualChapterOperation; schema: ZodTypeAny; stream?: boolean}> = [
    {path: "generate", operation: "write", schema: chapterRuntimeRequestSchema, stream: true},
    {path: "runtime/run", operation: "write", schema: chapterRuntimeRequestSchema, stream: true},
    {path: "repair", operation: "repair", schema: repairSchema, stream: true},
    ...["review", "audit/full", "audit/continuity", "audit/character", "audit/plot"].map(path =>
      ({path, operation: "audit" as const, schema: reviewSchema})),
  ];
  for (const route of routes) {
    router.post(`/:id/chapters/:chapterId/${route.path}`, authMiddleware, (req, _res, next) => {
      void entry.handles(req.params.id as string).then(handled => next(handled ? undefined : "route"), next);
    }, validate({params: chapterParamsSchema, body: route.schema}), async (req, res, next) => {
      const abort = new AbortController();
      res.once("close", () => abort.abort());
      try {
        const {id, chapterId} = req.params as {id: string; chapterId: string};
        const runId = await entry.start(id, chapterId, route.operation, req.body);
        if (route.stream) {
          let result: Awaited<ReturnType<typeof entry.waitForResult>>;
          await streamToSSE(res, (async function* () {
            result = await entry.waitForResult(id, chapterId, runId, abort.signal);
            yield new AIMessageChunk(result.content);
          })(), () => ({frames: [{type: "runtime_package", package: result.runtimePackage}]}));
        } else {
          const result = await entry.waitForResult(id, chapterId, runId, abort.signal);
          res.json({success: true, data: result.review, message: "Chapter review completed."});
        }
      } catch (error) {
        if (!abort.signal.aborted) next(error);
      }
    });
  }
  return router;
}
