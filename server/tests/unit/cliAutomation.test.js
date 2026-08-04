const test = require("node:test");
const assert = require("node:assert/strict");
const { cliAutomationService } = require("../../dist/platform/cli/CLIAutomationService.js");
const { prisma } = require("../../dist/db/prisma.js");

test("PAI Insight 7: CLI-First Scriptable Automation Engine", async (t) => {
  await t.test("parses command-line argv flags correctly", () => {
    const rawArgs = ["export-assets", "--novelId=test-novel-123", "--dryRun", "--verbose"];
    const parsed = cliAutomationService.parseArgv(rawArgs);

    assert.equal(parsed.command, "export-assets");
    assert.equal(parsed.options.novelId, "test-novel-123");
    assert.equal(parsed.options.dryRun, true);
    assert.equal(parsed.options.verbose, true);
  });

  await t.test("executes audit-health command in headless mode", async () => {
    const result = await cliAutomationService.executeCommand("audit-health", {});

    assert.equal(result.success, true);
    assert.equal(result.command, "audit-health");
    assert.ok(typeof result.durationMs === "number");
    assert.equal(result.metrics.systemStatus, "healthy");
    assert.ok(result.logs.length > 0);
  });

  await t.test("executes export-assets command and returns backup metrics", async () => {
    const novelId = `test-novel-cli-${Date.now()}`;

    await prisma.novel.create({
      data: {
        id: novelId,
        title: "CLI Export Test Novel",
        description: "CLI automation test description",
      },
    });

    try {
      const result = await cliAutomationService.executeCommand("export-assets", { novelId });

      assert.equal(result.success, true);
      assert.equal(result.command, "export-assets");
      assert.equal(result.metrics.verified, true);
      assert.ok(result.metrics.exportedAt);
    } finally {
      await prisma.novel.deleteMany({ where: { id: novelId } });
    }
  });

  await t.test("returns failed CLIExecutionResult when command execution encounters missing params", async () => {
    const result = await cliAutomationService.executeCommand("export-assets", {});

    assert.equal(result.success, false);
    assert.match(result.error, /必须指定 --novelId=/);
  });
});
