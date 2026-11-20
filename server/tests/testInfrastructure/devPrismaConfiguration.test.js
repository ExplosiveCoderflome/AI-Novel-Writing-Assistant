const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const dotenv = require("dotenv");

const scriptPath = path.resolve(__dirname, "../../scripts/ensure-dev-prisma.cjs");

// Execute the actual preparation script with real dotenv parsing and isolated files.
// Prisma and native binding subprocesses are intercepted, so no database is opened.
function prepareFixture(localConfiguration, inheritedEnvironment = {}, watchPlan) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dev-prisma-configuration-"));
  fs.mkdirSync(path.join(root, "src/prisma"), { recursive: true });
  for (const schema of ["schema.prisma", "schema.sqlite.prisma"]) {
    fs.writeFileSync(path.join(root, "src/prisma", schema), "fixture schema");
  }
  if (localConfiguration !== null) fs.writeFileSync(path.join(root, ".env"), localConfiguration);
  const environment = { ...inheritedEnvironment };
  const calls = [];
  const fixtureRequire = (name) => {
    if (name === "dotenv") return { config: (options) => dotenv.config({ ...options, processEnv: environment }) };
    if (name === "child_process") return {
      spawnSync: (command, args, options) => {
        calls.push({ command, args, cwd: options.cwd, environment: { ...options.env }, input: options.input });
        return { status: 0, stdout: args.includes("diff") ? watchPlan : "ok", stderr: "" };
      },
    };
    return require(name);
  };
  fixtureRequire.resolve = () => { throw new Error("Native binding probes are outside this configuration fixture."); };
  const scriptModule = {};
  if (watchPlan === undefined) fixtureRequire.main = scriptModule;
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), {
    __dirname: path.join(root, "scripts"), require: fixtureRequire, module: scriptModule,
    process: { env: environment, execPath: process.execPath, exit: (code) => { throw new Error(`Unexpected exit: ${code}`); } },
    console: { log() {}, warn() {}, error() {} },
  }, { filename: scriptPath });
  return { root, environment, calls: calls.filter((call) => call.args[0].endsWith(path.join("prisma", "build", "index.js"))) };
}

test("development preparation reads the server-local database before choosing a schema or invoking Prisma", () => {
  const url = "file:D:/acceptance/previous-session.db";
  const result = prepareFixture(`DATABASE_URL=${url}\nDIRECTOR_NEXT_ENABLED=true\n`);
  assert.equal(result.environment.DATABASE_URL, url);
  assert.equal(result.environment.DIRECTOR_NEXT_ENABLED, "true");
  assert.equal(result.calls.length, 2);
  for (const call of result.calls) {
    assert.equal(call.environment.DATABASE_URL, url);
    assert.equal(call.cwd, result.root);
    assert.equal(call.args.at(-1), "src/prisma/schema.sqlite.prisma");
  }
});

test("explicit shell configuration takes priority over the server-local environment file", () => {
  const url = "postgresql://fixture:fixture@localhost/isolated";
  const result = prepareFixture("DATABASE_URL=file:./local.db\nDIRECTOR_NEXT_ENABLED=true\n", {
    DATABASE_URL: url, DIRECTOR_NEXT_ENABLED: "false",
  });
  assert.equal(result.environment.DIRECTOR_NEXT_ENABLED, "false");
  assert.equal(result.calls.length, 2);
  for (const call of result.calls) {
    assert.equal(call.environment.DATABASE_URL, url);
    assert.equal(call.args.at(-1), "src/prisma/schema.prisma");
  }
});

test("missing local configuration preserves the existing SQLite default without enabling the director", () => {
  const result = prepareFixture(null);
  assert.equal(result.environment.DIRECTOR_NEXT_ENABLED, undefined);
  assert.equal(result.calls.length, 2);
  for (const call of result.calls) assert.equal(call.args.at(-1), "src/prisma/schema.sqlite.prisma");
});

test("watch prepares an added conversation table and index before loading the new client", () => {
  const sql = '-- AlterTable\nALTER TABLE "OutlineProposal" ADD COLUMN "characterNodeId" TEXT;\n'
    + '-- CreateTable\nCREATE TABLE "AgentConversationTurn" ("id" TEXT PRIMARY KEY);\n'
    + '-- CreateIndex\nCREATE INDEX "turns" ON "AgentConversationTurn"("id");';
  const {calls} = prepareFixture(null, {}, sql);
  assert.deepEqual(calls.map(call => call.args[1]), ["migrate", "db", "generate"]);
  assert.equal(calls[1].args[2], "execute");
  assert.equal(calls[1].input, `BEGIN;\n${sql}\nCOMMIT;\n`);
});

test("watch stops before applying a plan that would replace existing data", () => {
  for (const plan of ['CREATE TABLE "new" ("id" TEXT); DROP TABLE "old";',
    'ALTER TABLE "stories" ADD COLUMN "notes" TEXT, DROP COLUMN "draft";']) {
    assert.throws(() => prepareFixture(null, {}, plan), /热更新包含/);
  }
});
