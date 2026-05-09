const test = require("node:test");
const assert = require("node:assert/strict");

const { parseRequestHeadersText } = require("../dist/llm/requestHeaders.js");

test("parseRequestHeadersText supports Header: value", () => {
  const headers = parseRequestHeadersText("User-Agent: Mozilla/5.0\nX-Test: 1");
  assert.equal(headers["User-Agent"], "Mozilla/5.0");
  assert.equal(headers["X-Test"], "1");
});

test("parseRequestHeadersText supports Header+value", () => {
  const headers = parseRequestHeadersText("User-Agent+Mozilla/5.0");
  assert.equal(headers["User-Agent"], "Mozilla/5.0");
});

test("parseRequestHeadersText ignores empty lines and trims key/value", () => {
  const headers = parseRequestHeadersText("\n  X-Test :   1  \n\n");
  assert.deepEqual(headers, { "X-Test": "1" });
});

test("parseRequestHeadersText ignores rows with empty header name", () => {
  const headers = parseRequestHeadersText(": 1\n+2\n  :3\n  ");
  assert.deepEqual(headers, {});
});

test("parseRequestHeadersText keeps plus signs inside header values", () => {
  const headers = parseRequestHeadersText("User-Agent+Claude-Code/1.0 (+https://example.invalid)");
  assert.equal(headers["User-Agent"], "Claude-Code/1.0 (+https://example.invalid)");
});

test("parseRequestHeadersText ignores unsafe header names", () => {
  const headers = parseRequestHeadersText([
    "Authorization: Bearer token",
    "x-api-key: key",
    "Host: example.com",
    "Content-Length: 1",
    "Bad Header: value",
    "X-Safe: ok",
  ].join("\n"));
  assert.deepEqual(headers, { "X-Safe": "ok" });
});
