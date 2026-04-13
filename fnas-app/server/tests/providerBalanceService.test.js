const test = require("node:test");
const assert = require("node:assert/strict");

const { providerBalanceService } = require("../dist/services/settings/ProviderBalanceService.js");

test("provider balance service parses DeepSeek balance payload", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    is_available: true,
    balance_infos: [{
      currency: "CNY",
      total_balance: "120.50",
      granted_balance: "20.50",
      topped_up_balance: "100.00",
    }],
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });

  try {
    const result = await providerBalanceService.getProviderBalance({
      provider: "deepseek",
      apiKey: "test-deepseek-key",
    });
    assert.equal(result.status, "available");
    assert.equal(result.currency, "CNY");
    assert.equal(result.availableBalance, 120.5);
    assert.equal(result.grantedBalance, 20.5);
    assert.equal(result.toppedUpBalance, 100);
  } finally {
    global.fetch = originalFetch;
  }
});

test("provider balance service parses Kimi balance payload", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    code: 0,
    status: true,
    data: {
      available_balance: 49.58894,
      voucher_balance: 46.58893,
      cash_balance: 3.00001,
    },
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });

  try {
    const result = await providerBalanceService.getProviderBalance({
      provider: "kimi",
      apiKey: "test-kimi-key",
    });
    assert.equal(result.status, "available");
    assert.equal(result.currency, "CNY");
    assert.equal(result.availableBalance, 49.58894);
    assert.equal(result.voucherBalance, 46.58893);
    assert.equal(result.cashBalance, 3.00001);
  } finally {
    global.fetch = originalFetch;
  }
});

test("provider balance service marks qwen as unsupported with current credentials", async () => {
  const result = await providerBalanceService.getProviderBalance({
    provider: "qwen",
    apiKey: "test-qwen-key",
  });
  assert.equal(result.status, "unsupported");
  assert.equal(result.supported, false);
  assert.match(result.message, /DashScope API Key/);
});
