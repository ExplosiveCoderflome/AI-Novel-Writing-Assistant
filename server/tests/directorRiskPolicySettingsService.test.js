const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_DIRECTOR_RISK_POLICY,
  DIRECTOR_RISK_NOTICE_THRESHOLD_KEY,
  DIRECTOR_RISK_PAUSE_THRESHOLD_KEY,
  DirectorRiskPolicySettingsService,
} = require("../dist/services/settings/DirectorRiskPolicySettingsService.js");

function buildStore() {
  const values = new Map();
  return {
    values,
    store: {
      async findMany({ where }) {
        return where.key.in
          .filter((key) => values.has(key))
          .map((key) => ({ key, value: values.get(key) }));
      },
      async upsert({ where, update }) {
        values.set(where.key, update.value);
      },
    },
  };
}

test("DirectorRiskPolicySettingsService defaults to notice 5 and pause 8", async () => {
  const { store } = buildStore();
  const service = new DirectorRiskPolicySettingsService({
    appSettingStore: store,
    transaction: (operations) => Promise.all(operations),
  });

  assert.deepEqual(await service.getRiskPolicy(), DEFAULT_DIRECTOR_RISK_POLICY);
});

test("DirectorRiskPolicySettingsService persists a valid global policy", async () => {
  const { store, values } = buildStore();
  const service = new DirectorRiskPolicySettingsService({
    appSettingStore: store,
    transaction: (operations) => Promise.all(operations),
  });

  assert.deepEqual(
    await service.saveRiskPolicy({ noticeThreshold: 6, pauseThreshold: 7 }),
    { noticeThreshold: 6, pauseThreshold: 7 },
  );
  assert.equal(values.get(DIRECTOR_RISK_NOTICE_THRESHOLD_KEY), "6");
  assert.equal(values.get(DIRECTOR_RISK_PAUSE_THRESHOLD_KEY), "7");
  assert.deepEqual(await service.getRiskPolicy(), { noticeThreshold: 6, pauseThreshold: 7 });
});

test("DirectorRiskPolicySettingsService rejects scores outside the 8-point policy", async () => {
  const { store } = buildStore();
  const service = new DirectorRiskPolicySettingsService({
    appSettingStore: store,
    transaction: (operations) => Promise.all(operations),
  });

  await assert.rejects(
    service.saveRiskPolicy({ noticeThreshold: 8, pauseThreshold: 8 }),
    /2 到 7/,
  );
  await assert.rejects(
    service.saveRiskPolicy({ noticeThreshold: 1, pauseThreshold: 8 }),
    /2 到 7/,
  );
  await assert.rejects(
    service.saveRiskPolicy({ noticeThreshold: 6, pauseThreshold: 9 }),
    /3 到 8/,
  );
});

test("DirectorRiskPolicySettingsService keeps a legacy reminder setting but normalizes an over-range pause boundary", async () => {
  const { store, values } = buildStore();
  values.set(DIRECTOR_RISK_NOTICE_THRESHOLD_KEY, "6");
  values.set(DIRECTOR_RISK_PAUSE_THRESHOLD_KEY, "10");
  const service = new DirectorRiskPolicySettingsService({
    appSettingStore: store,
    transaction: (operations) => Promise.all(operations),
  });

  assert.deepEqual(await service.getRiskPolicy(), { noticeThreshold: 6, pauseThreshold: 8 });
});
