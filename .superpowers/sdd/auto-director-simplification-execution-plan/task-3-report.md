Task 3 implementation report (from implementer)

Commit: 78bbcf00b9ff5bc476f81cde42c1a8a8cdbeb064 (`优化：小说工作台按书展示当前导演任务`), committed on `refactor/director-simplification`; not pushed.

Implemented: novel workspace task selection by novelId; replaced navigation strips legacy task query parameters; manual_create workflow bootstrap submits novelId only; candidate task URL remains readable and redirects with replace after a novelId is available; task-history source links omit task IDs while detail remains task-ID based; simple shelf projection uses `resolveCurrentDirectorTask`; failed/blocked/waiting_recovery current tasks remain visible in the workspace rail. Route helper, rail visibility, and simple-shelf resolver tests were added/updated. Workflow wiki and date-based release note were updated. `clientUrlTaskIdParams` fixture metric was lowered from 34 to 0.

Verification claimed: shared and server builds passed; simple-shelf test 1/1; focused route/rail tests 17/17; task queue contract 6/6; client typecheck passed; guard 12/12 with metric 0; full client suite 212/218 with exactly the six pre-existing baseline failures. Full server fast/integration suites were not run by the implementer; controller will run them for phase acceptance. Browser/UI acceptance was not run and is reserved for the user.

Review fix round: direct chapter workspace entry now replaces legacy task URL parameters while preserving the chapter path and non-task query state. Candidate redirect follows the saved resume route and stage/chapter/volume location. Follow-up detail selection is scoped to the novel and list context; an initial legacy deep link survives automatic URL cleanup, while stale manual selections leave the detail/action target when the book, filters, page, or visible list changes. Focused regression tests cover these cases.

Review fix verification: targeted client tests 15/15; director simplification guard 12/12; client production build (includes TypeScript typecheck) passed. Full client suite 216/222 with only the same six baseline failures: `auto director progress panel uses dashboard view for main container state`; `every routed page has a route-specific mobile CSS landing point`; `mobile task filters stay in a compact three-column control grid`; `mobile route metadata covers every registered page`; `mobile more menu contains all non-primary registered pages`; `设置路由提供四个独立页面并兼容旧模型路由链接`. No server files changed in this fix round; final server suites remain with the controller.

Manual acceptance checklist (for user UI acceptance):

- [ ] Open the same novel from the novel list, home, simple shelf, novel workspace, and a run record; confirm each reaches the current book work and shows the current director task.
- [ ] Refresh the novel workspace and a direct chapter workspace URL; confirm the intended book, chapter, stage, and volume remain selected.
- [ ] Open legacy workspace URLs with `directorTaskId`, `workspaceTaskId`, or `taskId`; confirm the address bar replaces away task parameters while retaining other route state.
- [ ] Open a candidate confirmation URL before the book exists, then finish candidate selection; confirm it replaces to the saved novel workspace location without a task parameter.
- [ ] Start or take over a newer director task for the same novel; confirm the workspace, cockpit, drawer, and follow-up entrypoints use that current task rather than a historical URL task.
