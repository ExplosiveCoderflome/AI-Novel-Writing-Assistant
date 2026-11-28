import test from "node:test";
import assert from "node:assert/strict";
import { waitForCandidateResult } from "./waitForCandidateResult.ts";

const tick = async () => {};
test("slow generation and a transient status read keep observing the same accepted command", async () => {
  let polls = 0;
  const result = {batch: {id: "saved-round"}};
  const read = async () => {
    polls++;
    if (polls === 45) throw Object.assign(new Error("connection lost"), {status: undefined});
    if (polls > 100) return {data: {status: "succeeded", result}};
    return {data: {status: polls === 1 ? "queued" : polls === 2 ? "leased" : "running"}};
  };
  assert.equal(await waitForCandidateResult(read, new AbortController().signal, tick), result);
  assert.equal(polls, 101);
});

test("terminal failures take precedence over residual output and missing results stop polling", async () => {
  for (const status of ["failed", "cancelled", "stale"]) {
    const read = async () => ({data: {status, result: {batch: {}}, errorMessage: status}});
    await assert.rejects(waitForCandidateResult(read, new AbortController().signal, tick), {message: status});
  }
  await assert.rejects(waitForCandidateResult(async () => ({data: {status: "succeeded"}}), new AbortController().signal, tick), /未返回候选/);
  const denied = Object.assign(new Error("请登录"), {status: 401});
  await assert.rejects(waitForCandidateResult(async () => {throw denied;}, new AbortController().signal, tick), denied);
});

test("leaving the page stops local polling while the background command remains active", async () => {
  const page = new AbortController();
  let polls = 0;
  const read = async () => { polls++; return {data: {status: "running"}}; };
  await assert.rejects(waitForCandidateResult(read, page.signal, async () => page.abort()), {name: "AbortError"});
  assert.equal(polls, 1);
});
