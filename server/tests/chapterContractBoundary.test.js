const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildChapterPayoffDirectives,
} = require("../dist/services/novel/production/ContextAssemblyService.js");

function createPayoff(overrides) {
  return {
    id: overrides.id ?? overrides.ledgerKey,
    ledgerKey: overrides.ledgerKey,
    title: overrides.title,
    summary: overrides.summary ?? `${overrides.title} summary`,
    currentStatus: overrides.currentStatus,
    targetStartChapterOrder: overrides.targetStartChapterOrder ?? null,
    targetEndChapterOrder: overrides.targetEndChapterOrder ?? null,
    statusReason: overrides.statusReason ?? null,
  };
}

function createSnapshot(payoffs) {
  return {
    narrative: {
      currentChapterOrder: 3,
      overduePayoffs: payoffs.filter((item) => item.currentStatus === "overdue"),
      urgentPayoffs: payoffs.filter((item) => item.currentStatus === "pending_payoff"),
      pendingPayoffs: payoffs.filter((item) => item.currentStatus === "setup" || item.currentStatus === "hinted"),
    },
  };
}

test("chapter payoff directives never turn overdue pressure into direct payoff", () => {
  const directives = buildChapterPayoffDirectives(createSnapshot([
    createPayoff({
      ledgerKey: "setup-later",
      title: "后续规则伏笔",
      currentStatus: "setup",
      targetStartChapterOrder: 8,
    }),
    createPayoff({
      ledgerKey: "hinted-now",
      title: "已经轻触的订单异常",
      currentStatus: "hinted",
    }),
    createPayoff({
      ledgerKey: "pending-now",
      title: "临近兑现的代价",
      currentStatus: "pending_payoff",
    }),
    createPayoff({
      ledgerKey: "overdue-now",
      title: "逾期未兑现的读者承诺",
      currentStatus: "overdue",
    }),
  ]), []);

  assert.deepEqual(
    directives.map((item) => [item.ledgerKey, item.operation]),
    [
      ["overdue-now", "pressure"],
      ["pending-now", "pressure"],
      ["setup-later", "seed"],
      ["hinted-now", "touch"],
    ],
  );
});

test("chapter payoff directives forbid protected reveals instead of advancing them", () => {
  const directives = buildChapterPayoffDirectives(createSnapshot([
    createPayoff({
      ledgerKey: "self-recipient",
      title: "收件人其实是主角自己",
      summary: "订单真相会揭示收件人其实是主角自己。",
      currentStatus: "pending_payoff",
    }),
  ]), ["收件人其实是主角自己"]);

  assert.equal(directives.length, 1);
  assert.equal(directives[0].operation, "forbid");
  assert.equal(directives[0].forbiddenReveal, "收件人其实是主角自己");
});
