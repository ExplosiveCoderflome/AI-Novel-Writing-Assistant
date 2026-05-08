const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sharedPath = path.join(root, "src", "pages", "tasks", "taskCenterPage.shared.ts");
const detailPath = path.join(root, "src", "pages", "tasks", "taskCenterPage.detail.ts");
const pagePath = path.join(root, "src", "pages", "tasks", "TaskCenterPage.tsx");
const listHookPath = path.join(root, "src", "pages", "tasks", "hooks", "useTaskCenterList.ts");
const selectionHookPath = path.join(root, "src", "pages", "tasks", "hooks", "useTaskCenterSelection.ts");
const mutationsHookPath = path.join(root, "src", "pages", "tasks", "hooks", "useTaskCenterMutations.ts");

test("TaskCenter shared module exists and exposes list/detail formatting helpers", () => {
  assert.equal(fs.existsSync(sharedPath), true, "expected taskCenterPage.shared.ts to exist");
  const source = fs.readFileSync(sharedPath, "utf8");
  assert.match(source, /export const ACTIVE_STATUSES/);
  assert.match(source, /export function formatCheckpoint\(/);
  assert.match(source, /export function formatResumeTarget\(/);
  assert.match(source, /export function formatStatus\(/);
  assert.match(source, /export function normalizeTaskMeta\(/);
  assert.match(source, /export function normalizeTaskSteps\(/);
});

test("TaskCenter detail module exposes detail-state and follow-up handler helpers", () => {
  assert.equal(fs.existsSync(detailPath), true, "expected taskCenterPage.detail.ts to exist");
  const source = fs.readFileSync(detailPath, "utf8");
  assert.match(source, /export type TaskCenterSelectionState =/);
  assert.match(source, /export function buildTaskCenterSelectionState\(/);
  assert.match(source, /export function createTaskCenterFollowUpActionHandler\(/);
  assert.match(source, /canContinueFront10AutoExecution/);
  assert.match(source, /requiresCandidateSelection/);
  assert.match(source, /isChapterTitleDiversitySummary/);
  assert.doesNotMatch(source, /selectedTask\.resumeAction/);
  assert.doesNotMatch(source, /\.includes\("标题"\)/);
});

test("TaskCenter page delegates list, selection, and mutation logic to page-local hooks", () => {
  assert.equal(fs.existsSync(pagePath), true, "expected TaskCenterPage.tsx to exist");
  assert.equal(fs.existsSync(listHookPath), true, "expected useTaskCenterList.ts to exist");
  assert.equal(fs.existsSync(selectionHookPath), true, "expected useTaskCenterSelection.ts to exist");
  assert.equal(fs.existsSync(mutationsHookPath), true, "expected useTaskCenterMutations.ts to exist");

  const pageSource = fs.readFileSync(pagePath, "utf8");
  assert.match(pageSource, /from "\.\/hooks\/useTaskCenterList"/);
  assert.match(pageSource, /from "\.\/hooks\/useTaskCenterSelection"/);
  assert.match(pageSource, /from "\.\/hooks\/useTaskCenterMutations"/);
  assert.match(pageSource, /const list = useTaskCenterList\(/);
  assert.match(pageSource, /const selection = useTaskCenterSelection\(/);
  assert.match(pageSource, /const mutations = useTaskCenterMutations\(/);
  assert.doesNotMatch(pageSource, /const listQuery = useQuery\(/);
  assert.doesNotMatch(pageSource, /const detailQuery = useQuery\(/);
  assert.doesNotMatch(pageSource, /const retryMutation = useMutation\(/);
  assert.doesNotMatch(pageSource, /const cancelMutation = useMutation\(/);
  assert.doesNotMatch(pageSource, /const continueWorkflowMutation = useMutation\(/);
  assert.doesNotMatch(pageSource, /const archiveMutation = useMutation\(/);
  assert.doesNotMatch(pageSource, /const executeFollowUpActionMutation = useMutation\(/);
});
