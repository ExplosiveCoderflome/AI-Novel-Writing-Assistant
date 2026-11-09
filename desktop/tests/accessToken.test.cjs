const test = require("node:test");
const assert = require("node:assert/strict");
const { configureDesktopAccessToken } = require("../dist/runtime/access");

test("managed desktop shares a random credential while external development uses its server credential", t => {
  const previous = { token: process.env.AI_NOVEL_ACCESS_TOKEN, mode: process.env.AI_NOVEL_DESKTOP_SERVER_MODE };
  t.after(() => {
    for (const [key, value] of [["AI_NOVEL_ACCESS_TOKEN", previous.token], ["AI_NOVEL_DESKTOP_SERVER_MODE", previous.mode]]) {
      value === undefined ? delete process.env[key] : process.env[key] = value;
    }
  });
  delete process.env.AI_NOVEL_ACCESS_TOKEN;
  delete process.env.AI_NOVEL_DESKTOP_SERVER_MODE;
  assert.equal(configureDesktopAccessToken(false), undefined);
  const token = configureDesktopAccessToken(true);
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(configureDesktopAccessToken(true), token);
  assert.equal(process.env.AI_NOVEL_ACCESS_TOKEN, token);
  delete process.env.AI_NOVEL_ACCESS_TOKEN;
  assert.notEqual(configureDesktopAccessToken(true), token);
  process.env.AI_NOVEL_ACCESS_TOKEN = "external-test";
  process.env.AI_NOVEL_DESKTOP_SERVER_MODE = "external";
  assert.equal(configureDesktopAccessToken(false), "external-test");
});
