import assert from "node:assert/strict";
import test from "node:test";
import { readCandidateSelection, updateCandidateSelection } from "./selectionState.ts";

const changes = [
  { id: "change-1", kind: "replace", from: 0, to: 1, originalText: "甲", candidateText: "乙", chunkIds: ["delete-1", "insert-1"] },
  { id: "change-2", kind: "insert", from: 1, to: 1, originalText: "", candidateText: "。", chunkIds: ["insert-2"] },
];

test("new candidates select every safe change by default", () => {
  const selected = readCandidateSelection({ sessionId: "", byCandidate: {} }, "session-1", "candidate-1", changes);
  assert.deepEqual([...selected], ["change-1", "change-2"]);
});

test("candidate choices remain independent and stale sessions reset", () => {
  const state = updateCandidateSelection({ sessionId: "session-1", byCandidate: {} }, "session-1", "candidate-1", new Set(["change-1"]));
  assert.deepEqual([...readCandidateSelection(state, "session-1", "candidate-1", changes)], ["change-1"]);
  assert.deepEqual([...readCandidateSelection(state, "session-1", "candidate-2", changes)], ["change-1", "change-2"]);
  assert.deepEqual([...readCandidateSelection(state, "session-2", "candidate-1", changes)], ["change-1", "change-2"]);
});
