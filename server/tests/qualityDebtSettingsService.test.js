const test = require("node:test");
const assert = require("node:assert/strict");

const {
  QUALITY_DEBT_AUTO_PROMOTION_ACK_TEXT,
  QualityDebtSettingsService,
} = require("../dist/services/settings/QualityDebtSettingsService.js");

function buildStore() {
  const values = new Map();
  const upsertCalls = [];
  return {
    values,
    upsertCalls,
    store: {
      async findMany({ where }) {
        const keys = where.key.in;
        return keys
          .filter((key) => values.has(key))
          .map((key) => ({ key, value: values.get(key) }));
      },
      async upsert({ where, create, update }) {
        upsertCalls.push({ where, create, update });
        values.set(where.key, update.value);
        return { key: where.key, value: update.value };
      },
    },
  };
}

test("QualityDebtSettingsService defaults to disabled", async () => {
  const { store } = buildStore();
  const service = new QualityDebtSettingsService({
    appSettingStore: store,
    transaction: (operations) => Promise.all(operations),
  });

  const settings = await service.getAutoPromotionSettings();

  assert.equal(settings.enabled, false);
  assert.equal(settings.baselineAt, null);
  assert.equal(settings.acknowledgementText, QUALITY_DEBT_AUTO_PROMOTION_ACK_TEXT);
});

test("QualityDebtSettingsService requires explicit acknowledgement before enabling", async () => {
  const { store, values } = buildStore();
  const service = new QualityDebtSettingsService({
    appSettingStore: store,
    transaction: (operations) => Promise.all(operations),
    now: () => new Date("2026-07-01T10:00:00.000Z"),
  });

  await assert.rejects(
    service.saveAutoPromotionSettings({ enabled: true }),
    /需要先确认风险说明/,
  );
  assert.equal(values.size, 0);

  await assert.rejects(
    service.saveAutoPromotionSettings({
      enabled: true,
      acknowledgedRisks: true,
      confirmationText: "确认",
    }),
    /请输入确认文本/,
  );
  assert.equal(values.size, 0);
});

test("QualityDebtSettingsService writes baseline only on first enable", async () => {
  const { store } = buildStore();
  let now = new Date("2026-07-01T10:00:00.000Z");
  const service = new QualityDebtSettingsService({
    appSettingStore: store,
    transaction: (operations) => Promise.all(operations),
    now: () => now,
    warn: () => {},
  });

  const first = await service.saveAutoPromotionSettings({
    enabled: true,
    acknowledgedRisks: true,
    confirmationText: QUALITY_DEBT_AUTO_PROMOTION_ACK_TEXT,
  });
  assert.equal(first.enabled, true);
  assert.equal(first.baselineAt, "2026-07-01T10:00:00.000Z");

  now = new Date("2026-07-02T10:00:00.000Z");
  const second = await service.saveAutoPromotionSettings({
    enabled: true,
    acknowledgedRisks: true,
    confirmationText: QUALITY_DEBT_AUTO_PROMOTION_ACK_TEXT,
  });
  assert.equal(second.baselineAt, "2026-07-01T10:00:00.000Z");

  const disabled = await service.saveAutoPromotionSettings({ enabled: false });
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.baselineAt, "2026-07-01T10:00:00.000Z");
});

