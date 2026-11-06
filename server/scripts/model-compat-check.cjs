// Build first: pnpm --filter @ai-novel/server build
// Explicit network opt-in: pnpm --filter @ai-novel/server compat:check --allow-network
require("dotenv").config({ quiet: true });
if (!process.argv.includes("--allow-network")) {
  console.log("No requests sent. Pass --allow-network to probe configured models (small API charges apply).");
  process.exit(0);
}
(async () => {
  const { secretStore } = require("../dist/services/settings/secretStore.js");
  const { prisma } = require("../dist/db/prisma.js");
  const { probeModel } = require("../dist/llm/compatibility/probing.js");
  const { PROVIDERS, getProviderEnvApiKey, getProviderEnvModel, getProviderEnvBaseUrl } = require("../dist/llm/providers.js");
  const configured = await secretStore.listProviders({ onlyActive: true });
  const providers = new Map(configured.map((item) => [item.provider, { provider: item.provider, model: item.model || undefined, baseURL: item.baseURL || undefined }]));
  for (const provider of Object.keys(PROVIDERS)) {
    if (!providers.has(provider) && getProviderEnvApiKey(provider)) providers.set(provider, { provider, model: getProviderEnvModel(provider) || PROVIDERS[provider].defaultModel, baseURL: getProviderEnvBaseUrl(provider) || PROVIDERS[provider].baseURL });
  }
  try {
    for (const input of providers.values()) {
      try {
        const { resolveLLMClientOptions } = require("../dist/llm/factory.js");
        const resolved = await resolveLLMClientOptions(input.provider, input);
        const profile = await probeModel({ provider: input.provider, model: resolved.model, baseURL: resolved.baseURL }, { allowNetwork: true });
        console.log(`${input.provider} / ${resolved.model}: ${profile.structuredModes.join(" -> ")}; thinking off=${profile.thinkingToggle.supported ? "verified" : "unconfirmed"}`);
      } catch { console.log(`${input.provider}: check failed; inspect connection settings and retry.`); process.exitCode = 1; }
    }
    if (!providers.size) console.log("No configured providers found.");
  } finally { await prisma.$disconnect(); }
})().catch(() => { console.error("Compatibility check failed. Check database and provider configuration."); process.exitCode = 1; });
