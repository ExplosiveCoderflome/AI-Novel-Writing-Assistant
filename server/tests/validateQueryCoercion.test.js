const test = require("node:test");
const assert = require("node:assert/strict");
const { z } = require("zod");

const { validate } = require("../dist/middleware/validate.js");

function runMiddleware(handler, request) {
  return new Promise((resolve, reject) => {
    handler(request, {}, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

test("query validation writes coerced chapter anchors back to the request", async () => {
  const request = { query: { chapterAnchor: "12" } };
  await runMiddleware(validate({
    query: z.object({ chapterAnchor: z.coerce.number().int().positive() }),
  }), request);

  assert.equal(request.query.chapterAnchor, 12);
});
