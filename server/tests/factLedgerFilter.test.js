const test = require("node:test");
const assert = require("node:assert/strict");

const {
  filterAcceptedFactItems,
} = require("../dist/services/novel/fact/factLedgerFilter.js");

function coverage(overrides = {}) {
  return {
    status: "satisfied",
    missing: [],
    summary: "ok",
    ...overrides,
  };
}

function filter(overrides = {}) {
  return filterAcceptedFactItems({
    chapterOrder: 7,
    mustHitNow: [
      "主角当众拒绝婚约，明确站到家族对立面。",
      "拿到青铜钥匙，并发现钥匙来自失踪师父。",
    ],
    obligationCoverage: coverage(),
    acceptanceRiskTags: [],
    ...overrides,
  });
}

test("filterAcceptedFactItems allows every mustHitNow item when coverage is satisfied", () => {
  const result = filter();

  assert.deepEqual(result.excluded, []);
  assert.deepEqual(result.accepted, [{
    text: "第7章已完成：主角当众拒绝婚约，明确站到家族对立面。",
    category: "completed",
  }, {
    text: "第7章已完成：拿到青铜钥匙，并发现钥匙来自失踪师父。",
    category: "completed",
  }]);
});

test("filterAcceptedFactItems removes exactly matched missing mustHitNow obligations", () => {
  const result = filter({
    obligationCoverage: coverage({
      status: "partial",
      missing: [{
        kind: "must_hit_now",
        summary: "拿到青铜钥匙，并发现钥匙来自失踪师父。",
        evidence: "正文只写到看见钥匙，没有拿到。",
      }],
    }),
  });

  assert.deepEqual(result.accepted.map((item) => item.text), [
    "第7章已完成：主角当众拒绝婚约，明确站到家族对立面。",
  ]);
  assert.equal(result.excluded.length, 1);
  assert.equal(result.excluded[0].text, "拿到青铜钥匙，并发现钥匙来自失踪师父。");
  assert.equal(result.excluded[0].reason, "missing_must_hit_now");
  assert.equal(result.excluded[0].matchedMissingKind, "must_hit_now");
});

test("filterAcceptedFactItems removes paraphrased missing mustHitNow obligations by similarity", () => {
  const result = filter({
    mustHitNow: [
      "林澈在宗门大比前公开接受三日后决战。",
      "女主确认暗线账册藏在祠堂地砖下。",
    ],
    obligationCoverage: coverage({
      status: "partial",
      missing: [{
        kind: "must_hit_now",
        summary: "林澈同意三日后的公开决战。",
        evidence: "正文只有旁人提到挑战，没有林澈接受。",
      }],
    }),
  });

  assert.deepEqual(result.accepted.map((item) => item.text), [
    "第7章已完成：女主确认暗线账册藏在祠堂地砖下。",
  ]);
  assert.equal(result.excluded.length, 1);
  assert.equal(result.excluded[0].text, "林澈在宗门大比前公开接受三日后决战。");
  assert.equal(result.excluded[0].reason, "missing_must_hit_now");
  assert.ok(result.excluded[0].matchScore >= 0.32);
});

test("filterAcceptedFactItems conservatively removes the closest item when missing text cannot be matched", () => {
  const result = filter({
    mustHitNow: [
      "拿到青铜钥匙，并发现钥匙来自失踪师父。",
      "找到暗室出口，带同伴离开地牢。",
    ],
    obligationCoverage: coverage({
      status: "partial",
      missing: [{
        kind: "must_hit_now",
        summary: "师父交代新的禁令。",
        evidence: "正文没有出现师父交代禁令。",
      }],
    }),
  });

  assert.equal(result.accepted.length, 1);
  assert.equal(result.excluded.length, 1);
  assert.equal(result.excluded[0].reason, "unmatched_missing_must_hit_now");
  assert.equal(result.excluded[0].matchedMissingKind, "must_hit_now");
});

test("filterAcceptedFactItems ignores non-mustHitNow missing obligations for completed fact writes", () => {
  const result = filter({
    obligationCoverage: coverage({
      status: "partial",
      missing: [{
        kind: "payoff_touch",
        summary: "没有轻触暗线账册伏笔。",
        evidence: "正文没有相关暗示。",
      }],
    }),
  });

  assert.equal(result.accepted.length, 2);
  assert.deepEqual(result.excluded, []);
});

test("filterAcceptedFactItems skips all items when coverage is unmet or the acceptance gate is unavailable", () => {
  const unmet = filter({
    obligationCoverage: coverage({
      status: "unmet",
      missing: [{
        kind: "must_hit_now",
        summary: "全部未兑现。",
        evidence: "正文没有推进。",
      }],
    }),
  });
  assert.equal(unmet.accepted.length, 0);
  assert.deepEqual(unmet.excluded.map((item) => item.reason), ["coverage_unmet", "coverage_unmet"]);

  const gateUnavailable = filter({
    acceptanceRiskTags: [" acceptance_gate_unavailable "],
  });
  assert.equal(gateUnavailable.accepted.length, 0);
  assert.deepEqual(
    gateUnavailable.excluded.map((item) => item.reason),
    ["acceptance_gate_unavailable", "acceptance_gate_unavailable"],
  );
});
