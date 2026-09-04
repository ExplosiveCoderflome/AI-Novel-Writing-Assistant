import test from "node:test";
import assert from "node:assert/strict";

import {
  shouldOpenAutomaticSetupPrompt,
  shouldOpenSetupPromptForRoute,
  shouldInitializeProviderSelection,
  shouldShowFirstNovelHandoff,
} from "./creationSetupState.ts";

test("does not open setup while creation status is still loading", () => {
  assert.equal(shouldOpenAutomaticSetupPrompt({
    statusResolved: false,
    readyForCreation: false,
    dismissed: false,
  }), false);
  assert.equal(shouldOpenSetupPromptForRoute({
    statusResolved: false,
    readyForCreation: false,
    pathname: "/novels/auto-director",
  }), false);
});

test("does not open setup after the creation environment is ready", () => {
  assert.equal(shouldOpenAutomaticSetupPrompt({
    statusResolved: true,
    readyForCreation: true,
    dismissed: false,
  }), false);
  assert.equal(shouldOpenSetupPromptForRoute({
    statusResolved: true,
    readyForCreation: true,
    pathname: "/worlds/generator",
  }), false);
});

test("opens setup only when a resolved status says configuration is required", () => {
  assert.equal(shouldOpenAutomaticSetupPrompt({
    statusResolved: true,
    readyForCreation: false,
    dismissed: false,
  }), true);
  assert.equal(shouldOpenAutomaticSetupPrompt({
    statusResolved: true,
    readyForCreation: false,
    dismissed: true,
  }), false);
  assert.equal(shouldOpenSetupPromptForRoute({
    statusResolved: true,
    readyForCreation: false,
    pathname: "/creative-hub",
  }), true);
});

test("shows the first novel handoff only after automatic configuration succeeds", () => {
  assert.equal(shouldShowFirstNovelHandoff({
    configurationSucceeded: true,
    forceConfiguration: false,
  }), true);
  assert.equal(shouldShowFirstNovelHandoff({
    configurationSucceeded: true,
    forceConfiguration: true,
  }), false);
  assert.equal(shouldShowFirstNovelHandoff({
    configurationSucceeded: false,
    forceConfiguration: false,
  }), false);
});

test("does not replace an explicit custom provider choice with the default provider", () => {
  assert.equal(shouldInitializeProviderSelection({
    open: true,
    statusAvailable: true,
    providerKind: "custom",
    provider: "",
  }), false);
  assert.equal(shouldInitializeProviderSelection({
    open: true,
    statusAvailable: true,
    providerKind: "builtin",
    provider: "",
  }), true);
});
