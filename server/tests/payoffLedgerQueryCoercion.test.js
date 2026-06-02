const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const { z } = require("zod");

const { registerNovelPlanningRoutes } = require("../dist/routes/novelPlanningRoutes.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function buildApp(novelService) {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  registerNovelPlanningRoutes({
    router,
    novelService,
    idParamsSchema: z.object({ id: z.string().min(1) }),
    chapterParamsSchema: z.object({ id: z.string(), chapterId: z.string() }),
    arcPlanParamsSchema: z.object({ id: z.string(), arcId: z.string() }),
    llmGenerateSchema: z.object({}).passthrough(),
    replanSchema: z.object({}).passthrough(),
  });
  app.use("/novels", router);
  // Minimal error handler so a thrown/next(error) surfaces as 500 instead of hanging.
  app.use((err, _req, res, _next) => {
    res.status(500).json({ success: false, error: String(err?.message ?? err) });
  });
  return app;
}

// The validate middleware does not write coerced query values back to req.query, and this
// route reads `req.query as z.infer<...>` (trusting the cast). The query schema declares
// `chapterOrder: z.coerce.number()`, so without re-parsing the handler receives the raw
// string "5" instead of the number 5 — and getPayoffLedger silently ignores a non-number
// chapterOrder, returning the wrong chapter's ledger.
test("payoff-ledger passes chapterOrder as a coerced number, not a raw query string", async () => {
  let receivedChapterOrder;
  let receivedType;
  const novelService = {
    getPayoffLedger: async (_id, chapterOrder) => {
      receivedChapterOrder = chapterOrder;
      receivedType = typeof chapterOrder;
      return { items: [] };
    },
  };

  const server = http.createServer(buildApp(novelService));
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/novels/novel-1/payoff-ledger?chapterOrder=5`);
    assert.equal(res.status, 200, "request should succeed");
  } finally {
    server.close();
  }

  assert.equal(receivedType, "number", `chapterOrder should reach the service as a number, got ${receivedType}`);
  assert.equal(receivedChapterOrder, 5);
});

test("payoff-ledger leaves chapterOrder undefined when the query param is absent", async () => {
  let receivedChapterOrder = "sentinel";
  const novelService = {
    getPayoffLedger: async (_id, chapterOrder) => {
      receivedChapterOrder = chapterOrder;
      return { items: [] };
    },
  };

  const server = http.createServer(buildApp(novelService));
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/novels/novel-1/payoff-ledger`);
    assert.equal(res.status, 200);
  } finally {
    server.close();
  }

  assert.equal(receivedChapterOrder, undefined);
});
