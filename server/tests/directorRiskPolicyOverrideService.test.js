const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DirectorRiskPolicyOverrideService,
} = require("../dist/services/novel/director/settings/DirectorRiskPolicyOverrideService.js");

function buildStore(initial = { notice: null, pause: null }) {
  const row = {
    id: "novel-risk-policy-test",
    directorRiskNoticeThreshold: initial.notice,
    directorRiskPauseThreshold: initial.pause,
  };
  return {
    row,
    store: {
      async findUnique() {
        return { ...row };
      },
      async update({ data }) {
        row.directorRiskNoticeThreshold = data.directorRiskNoticeThreshold;
        row.directorRiskPauseThreshold = data.directorRiskPauseThreshold;
        return { ...row };
      },
    },
  };
}

test("DirectorRiskPolicyOverrideService exposes no override when both fields are null", async () => {
  const { store } = buildStore();
  const service = new DirectorRiskPolicyOverrideService({ novelStore: store });

  assert.equal(await service.getOverride("novel-risk-policy-test"), null);
});

test("DirectorRiskPolicyOverrideService saves and clears a complete novel override", async () => {
  const { store, row } = buildStore();
  const service = new DirectorRiskPolicyOverrideService({ novelStore: store });

  assert.deepEqual(
    await service.saveOverride("novel-risk-policy-test", { noticeThreshold: 5, pauseThreshold: 6 }),
    { noticeThreshold: 5, pauseThreshold: 6 },
  );
  assert.equal(row.directorRiskNoticeThreshold, 5);
  assert.equal(row.directorRiskPauseThreshold, 6);

  assert.equal(await service.saveOverride("novel-risk-policy-test", null), null);
  assert.equal(row.directorRiskNoticeThreshold, null);
  assert.equal(row.directorRiskPauseThreshold, null);
});

test("DirectorRiskPolicyOverrideService treats a legacy partial override as inherited", async () => {
  const { store } = buildStore({ notice: 6, pause: null });
  const service = new DirectorRiskPolicyOverrideService({ novelStore: store });

  assert.equal(await service.getOverride("novel-risk-policy-test"), null);
});

test("DirectorRiskPolicyOverrideService reads legacy pause overrides on the fixed 8-point scale", async () => {
  const { store } = buildStore({ notice: 6, pause: 10 });
  const service = new DirectorRiskPolicyOverrideService({ novelStore: store });

  assert.deepEqual(await service.getOverride("novel-risk-policy-test"), { noticeThreshold: 6, pauseThreshold: 8 });
});

test("DirectorRiskPolicyOverrideService rejects writes for a missing novel", async () => {
  const service = new DirectorRiskPolicyOverrideService({
    novelStore: {
      async findUnique() {
        return null;
      },
      async update() {
        throw new Error("should not update a missing novel");
      },
    },
  });

  await assert.rejects(
    service.saveOverride("missing-novel", { noticeThreshold: 6, pauseThreshold: 8 }),
    /小说不存在/,
  );
});
