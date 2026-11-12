import test from "node:test";
import assert from "node:assert/strict";
import { canApplyOperationSelection, findMissingOperationDependencies } from "./outlineProposalSelection.ts";

const operations = [
  { operationId: "add-volume", dependsOn: [] },
  { operationId: "add-chapter", dependsOn: ["add-volume"] },
  { operationId: "link-payoff", dependsOn: ["add-chapter"] },
];

test("proposal selection accepts a complete dependency chain", () => {
  assert.equal(canApplyOperationSelection(operations, ["add-volume", "add-chapter", "link-payoff"]), true);
  assert.equal(canApplyOperationSelection(operations, ["add-volume"]), true);
});

test("proposal selection reports direct and transitive missing dependencies", () => {
  assert.deepEqual(
    findMissingOperationDependencies(operations, ["add-chapter"]),
    [{ operationId: "add-chapter", dependencyIds: ["add-volume"] }],
  );
  assert.deepEqual(
    findMissingOperationDependencies(operations, ["add-chapter", "link-payoff"]),
    [{ operationId: "add-chapter", dependencyIds: ["add-volume"] }],
  );
  assert.equal(canApplyOperationSelection(operations, []), false);
});

test("proposal selection blocks dependencies absent from the proposal", () => {
  const invalid = [{ operationId: "update", dependsOn: ["missing-operation"] }];
  assert.deepEqual(
    findMissingOperationDependencies(invalid, ["update"]),
    [{ operationId: "update", dependencyIds: ["missing-operation"] }],
  );
  assert.equal(canApplyOperationSelection(invalid, ["update"]), false);
});
