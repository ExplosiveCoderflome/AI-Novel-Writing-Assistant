import test from "node:test";
import assert from "node:assert/strict";

import { resolveApiBaseUrlForEnvironment } from "./constants.ts";

const productionEnv = { DEV: false };
const developmentEnv = { DEV: true };
const webLocation = {
  protocol: "https:",
  hostname: "novel.example.com",
  origin: "https://novel.example.com",
};
const lanDevLocation = {
  protocol: "http:",
  hostname: "192.168.1.88",
  origin: "http://192.168.1.88:5173",
};

test("production web without configured API base uses same-origin API path", () => {
  assert.equal(
    resolveApiBaseUrlForEnvironment({
      runtimeConfig: { mode: "web" },
      viteEnv: productionEnv,
      windowLocation: webLocation,
    }),
    "/api",
  );
});

test("configured runtime API base wins in production web", () => {
  assert.equal(
    resolveApiBaseUrlForEnvironment({
      runtimeConfig: { mode: "web", apiBaseUrl: "https://api.example.com/api" },
      viteEnv: productionEnv,
      windowLocation: webLocation,
    }),
    "https://api.example.com/api",
  );
});

test("configured Vite API base wins when runtime config is absent", () => {
  assert.equal(
    resolveApiBaseUrlForEnvironment({
      runtimeConfig: { mode: "web" },
      viteEnv: { ...productionEnv, VITE_API_BASE_URL: "https://env.example.com/api" },
      windowLocation: webLocation,
    }),
    "https://env.example.com/api",
  );
});

test("configured desktop runtime API base is preserved", () => {
  assert.equal(
    resolveApiBaseUrlForEnvironment({
      runtimeConfig: { mode: "desktop", apiBaseUrl: "http://127.0.0.1:43123/api" },
      viteEnv: productionEnv,
      windowLocation: webLocation,
    }),
    "http://127.0.0.1:43123/api",
  );
});

test("development web without configured API base uses the Vite proxy path", () => {
  assert.equal(
    resolveApiBaseUrlForEnvironment({
      runtimeConfig: { mode: "web" },
      viteEnv: developmentEnv,
      windowLocation: lanDevLocation,
    }),
    "/api",
  );
});

test("development loopback API base adapts to the page host for LAN testing", () => {
  assert.equal(
    resolveApiBaseUrlForEnvironment({
      runtimeConfig: { mode: "web" },
      viteEnv: { ...developmentEnv, VITE_API_BASE_URL: "http://localhost:3000/api" },
      windowLocation: lanDevLocation,
    }),
    "http://192.168.1.88:3000/api",
  );
});
