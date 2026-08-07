import test from "node:test";
import assert from "node:assert/strict";

import {
  shouldOpenAutomaticSetupPrompt,
  shouldOpenSetupPromptForRoute,
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
