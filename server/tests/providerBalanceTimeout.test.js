const test = require("node:test");
const assert = require("node:assert/strict");

const { providerBalanceService } = require("../dist/services/settings/ProviderBalanceService.js");

// Regression for the missing `await` on response.json(): the 12s abort timer must only be
// cleared AFTER the response body has been fully read, otherwise a slow body read escapes
// the timeout. We scope detection to our own abort timer handle so concurrent tests that
// also call setTimeout/clearTimeout cannot pollute the result.
test("fetchJson reads the body before clearing the abort timeout", async () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const originalFetch = global.fetch;

  let abortHandle = null;
  let jsonResolved = false;
  let clearedWhileJsonPending = false;

  global.setTimeout = function patchedSetTimeout(fn, ms, ...rest) {
    const handle = originalSetTimeout(fn, ms, ...rest);
    if (ms === 12_000) {
      abortHandle = handle; // the abort timer created inside fetchJson
    }
    return handle;
  };
  global.clearTimeout = function patchedClearTimeout(handle) {
    if (handle === abortHandle && !jsonResolved) {
      clearedWhileJsonPending = true;
    }
    return originalClearTimeout(handle);
  };
  global.fetch = async () => ({
    ok: true,
    json: async () => {
      await new Promise((resolve) => originalSetTimeout(resolve, 5));
      jsonResolved = true;
      return {
        is_available: true,
        balance_infos: [{
          currency: "CNY",
          total_balance: "10.00",
          granted_balance: "0",
          topped_up_balance: "10.00",
        }],
      };
    },
  });

  try {
    await providerBalanceService.getProviderBalance({ provider: "deepseek", apiKey: "k" });
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    global.fetch = originalFetch;
  }

  assert.equal(
    clearedWhileJsonPending,
    false,
    "the abort timer must not be cleared while the response body is still being read",
  );
});
