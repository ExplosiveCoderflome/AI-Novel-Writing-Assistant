# Mobile Novel Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a phone-friendly mobile shell for the novel creation workspace and chapter editor without changing the desktop layout behavior.

**Architecture:** Use a mobile-only presentation layer that lives under dedicated `mobile` directories. Existing containers keep owning data loading, workflow state, mutations, SSE, and AI actions; mobile components consume the same props as the desktop views. Desktop components remain the default path and are only bypassed at phone breakpoints for the novel workspace routes.

**Tech Stack:** React 19, React Router, TypeScript, Tailwind CSS, Vite, existing node:test scripts for pure helpers, `pnpm --filter @ai-novel/client typecheck` for validation.

---

## File Structure

- Create `client/src/components/layout/mobile/useIsMobileViewport.ts`
  - One responsibility: return whether the browser is at the mobile workspace breakpoint.
  - Uses `window.matchMedia("(max-width: 767px)")` and returns `false` during SSR-like initial render.
- Create `client/src/components/layout/mobile/MobileWorkspaceShell.tsx`
  - One responsibility: mobile page chrome for workspace pages.
  - Provides top title area, optional subtitle/status, scrollable content, optional bottom actions.
- Create `client/src/pages/novels/mobile/MobileNovelStepNav.tsx`
  - One responsibility: horizontal mobile step navigation using `NOVEL_WORKSPACE_FLOW_STEPS` and `NOVEL_WORKSPACE_TOOL_TABS`.
- Create `client/src/pages/novels/mobile/mobileNovelWorkspaceUtils.ts`
  - One responsibility: pure helpers for mobile navigation summaries.
  - Test target for step metadata and default labels.
- Create `client/tests/mobileNovelWorkspaceUtils.test.js`
  - Node test for pure helper behavior.
- Create `client/src/pages/novels/mobile/MobileNovelEditView.tsx`
  - One responsibility: mobile composition for `NovelEditViewProps`.
  - Reuses existing tab panels and drawer/export controls from current view behavior where practical.
- Modify `client/src/pages/novels/NovelEdit.tsx`
  - Adds mobile viewport detection and selects `MobileNovelEditView` only on phone widths.
  - Desktop keeps rendering `NovelEditView` as before.
- Create `client/src/pages/novels/mobile/MobileChapterEditorShell.tsx`
  - One responsibility: phone-friendly wrapper for chapter editor by delegating to the desktop shell initially, then isolating mobile controls.
  - First implementation should guarantee no desktop route behavior changes while providing a mobile container and header.
- Modify `client/src/pages/novels/NovelChapterEdit.tsx`
  - Selects `MobileChapterEditorShell` only on phone widths.
  - Desktop keeps rendering `ChapterEditorShell` as before.
- Modify `client/src/index.css`
  - Adds safe-area utilities only if needed for mobile bottom spacing. Keep additions generic and small.

## Task 1: Add Mobile Viewport Detection

**Files:**
- Create: `client/src/components/layout/mobile/useIsMobileViewport.ts`

- [ ] **Step 1: Create the hook**

Create `client/src/components/layout/mobile/useIsMobileViewport.ts`:

```ts
import { useEffect, useState } from "react";

const MOBILE_WORKSPACE_MEDIA_QUERY = "(max-width: 767px)";

export function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_WORKSPACE_MEDIA_QUERY);
    const updateViewportState = () => {
      setIsMobile(mediaQuery.matches);
    };

    updateViewportState();
    mediaQuery.addEventListener("change", updateViewportState);

    return () => {
      mediaQuery.removeEventListener("change", updateViewportState);
    };
  }, []);

  return isMobile;
}
```

- [ ] **Step 2: Run focused typecheck**

Run: `pnpm --filter @ai-novel/client typecheck`

Expected: PASS. If unrelated pre-existing errors appear, record the first unrelated file and continue only after confirming the new hook has no type errors.

## Task 2: Add Pure Mobile Workspace Helpers

**Files:**
- Create: `client/src/pages/novels/mobile/mobileNovelWorkspaceUtils.ts`
- Create: `client/tests/mobileNovelWorkspaceUtils.test.js`

- [ ] **Step 1: Write the failing test**

Create `client/tests/mobileNovelWorkspaceUtils.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMobileNovelWorkspaceSteps,
  getMobileNovelWorkspaceStatusText,
} from "../src/pages/novels/mobile/mobileNovelWorkspaceUtils.ts";

const stepDefinitions = [
  { key: "basic", label: "项目设定" },
  { key: "structured", label: "节奏 / 拆章" },
  { key: "chapter", label: "章节执行" },
  { key: "history", label: "版本历史" },
];

test("buildMobileNovelWorkspaceSteps marks active and recommended steps", () => {
  const steps = buildMobileNovelWorkspaceSteps({
    activeTab: "chapter",
    workflowCurrentTab: "structured",
    steps: stepDefinitions,
  });

  const activeStep = steps.find((step) => step.key === "chapter");
  const recommendedStep = steps.find((step) => step.key === "structured");
  const historyStep = steps.find((step) => step.key === "history");

  assert.equal(activeStep?.isActive, true);
  assert.equal(activeStep?.isRecommended, false);
  assert.equal(recommendedStep?.isRecommended, true);
  assert.equal(historyStep?.label, "版本历史");
});

test("getMobileNovelWorkspaceStatusText explains current and recommended steps", () => {
  assert.equal(
    getMobileNovelWorkspaceStatusText({ activeLabel: "章节执行", workflowLabel: "节奏 / 拆章" }),
    "当前在章节执行，AI 建议继续节奏 / 拆章。",
  );
  assert.equal(
    getMobileNovelWorkspaceStatusText({ activeLabel: "章节执行", workflowLabel: "章节执行" }),
    "当前在章节执行。",
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node client/tests/mobileNovelWorkspaceUtils.test.js`

Expected: FAIL with module not found for `mobileNovelWorkspaceUtils.ts`.

- [ ] **Step 3: Implement the helpers**

Create `client/src/pages/novels/mobile/mobileNovelWorkspaceUtils.ts`:

```ts
import {
  getNovelWorkspaceTabLabel,
  normalizeNovelWorkspaceTab,
  NOVEL_WORKSPACE_FLOW_STEPS,
  NOVEL_WORKSPACE_TOOL_TABS,
  type NovelWorkspaceTab,
} from "../novelWorkspaceNavigation";

export interface MobileNovelWorkspaceStep {
  key: NovelWorkspaceTab;
  label: string;
  isActive: boolean;
  isRecommended: boolean;
}

export interface MobileNovelWorkspaceStepDefinition<Key extends string = string> {
  key: Key;
  label: string;
}

export interface MobileNovelWorkspaceStep<Key extends string = string> extends MobileNovelWorkspaceStepDefinition<Key> {
  isActive: boolean;
  isRecommended: boolean;
}

export function buildMobileNovelWorkspaceSteps<Key extends string>(input: {
  activeTab: Key;
  workflowCurrentTab?: Key | null;
  steps: ReadonlyArray<MobileNovelWorkspaceStepDefinition<Key>>;
}): Array<MobileNovelWorkspaceStep<Key>> {
  const workflowCurrentTab = input.workflowCurrentTab ?? input.activeTab;

  return input.steps.map((step) => ({
    ...step,
    isActive: step.key === input.activeTab,
    isRecommended: step.key === workflowCurrentTab && step.key !== input.activeTab,
  }));
}

export function getMobileNovelWorkspaceStatusText(input: {
  activeLabel: string;
  workflowLabel?: string | null;
}) {
  if (input.workflowLabel && input.workflowLabel !== input.activeLabel) {
    return `当前在${input.activeLabel}，AI 建议继续${input.workflowLabel}。`;
  }

  return `当前在${input.activeLabel}。`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node client/tests/mobileNovelWorkspaceUtils.test.js`

Expected: PASS with 2 tests passing.

## Task 3: Add Mobile Workspace Shell

**Files:**
- Create: `client/src/components/layout/mobile/MobileWorkspaceShell.tsx`

- [ ] **Step 1: Create shell component**

Create `client/src/components/layout/mobile/MobileWorkspaceShell.tsx`:

```tsx
import type { ReactNode } from "react";
import DesktopBrandMark from "@/components/layout/DesktopBrandMark";
import { cn } from "@/lib/utils";

interface MobileWorkspaceShellProps {
  title: string;
  subtitle?: string;
  statusText?: string;
  actions?: ReactNode;
  children: ReactNode;
  bottomBar?: ReactNode;
  className?: string;
}

export default function MobileWorkspaceShell(props: MobileWorkspaceShellProps) {
  const { title, subtitle, statusText, actions, children, bottomBar, className } = props;

  return (
    <div className={cn("min-h-screen bg-slate-50 text-foreground", className)}>
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <DesktopBrandMark className="mt-0.5 h-8 w-8 shrink-0 drop-shadow-none" />
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold leading-6">{title}</h1>
              {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
            </div>
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
        {statusText ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{statusText}</p> : null}
      </header>

      <main className={cn("min-h-0 px-3 py-4", bottomBar ? "pb-24" : "pb-6")}>{children}</main>

      {bottomBar ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/95 px-3 py-3 shadow-[0_-12px_28px_rgba(15,23,42,0.08)] backdrop-blur">
          {bottomBar}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @ai-novel/client typecheck`

Expected: PASS.

## Task 4: Add Mobile Step Navigation

**Files:**
- Create: `client/src/pages/novels/mobile/MobileNovelStepNav.tsx`

- [ ] **Step 1: Create step navigation component**

Create `client/src/pages/novels/mobile/MobileNovelStepNav.tsx`:

```tsx
import type { NovelWorkspaceTab } from "../novelWorkspaceNavigation";
import { cn } from "@/lib/utils";
import { buildMobileNovelWorkspaceSteps } from "./mobileNovelWorkspaceUtils";

interface MobileNovelStepNavProps {
  activeTab: string;
  workflowCurrentTab?: string | null;
  onSelectTab: (tab: NovelWorkspaceTab) => void;
}

export default function MobileNovelStepNav(props: MobileNovelStepNavProps) {
  const { activeTab, workflowCurrentTab, onSelectTab } = props;
  const steps = buildMobileNovelWorkspaceSteps({ activeTab, workflowCurrentTab });

  return (
    <nav className="-mx-3 overflow-x-auto px-3 pb-1" aria-label="小说创作步骤">
      <div className="flex min-w-max gap-2">
        {steps.map((step) => (
          <button
            key={step.key}
            type="button"
            onClick={() => onSelectTab(step.key)}
            aria-current={step.isActive ? "page" : undefined}
            className={cn(
              "relative rounded-full border px-3 py-2 text-xs font-medium transition-colors",
              step.isActive
                ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                : step.isRecommended
                  ? "border-sky-200 bg-sky-50 text-sky-800"
                  : "border-border/80 bg-background text-muted-foreground",
            )}
          >
            {step.label}
            {step.isRecommended ? (
              <span className="ml-1 rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] text-white">建议</span>
            ) : null}
          </button>
        ))}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @ai-novel/client typecheck`

Expected: PASS.

## Task 5: Add Mobile Novel Edit View

**Files:**
- Create: `client/src/pages/novels/mobile/MobileNovelEditView.tsx`
- Modify: `client/src/pages/novels/NovelEdit.tsx`

- [ ] **Step 1: Create mobile view component**

Create `client/src/pages/novels/mobile/MobileNovelEditView.tsx`:

```tsx
import { useState } from "react";
import { Loader2, MoreHorizontal } from "lucide-react";
import MobileWorkspaceShell from "@/components/layout/mobile/MobileWorkspaceShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import AITakeoverContainer from "@/components/workflow/AITakeoverContainer";
import BasicInfoTab from "../components/BasicInfoTab";
import ChapterManagementTab from "../components/ChapterManagementTab";
import NovelCharacterPanel from "../components/NovelCharacterPanel";
import NovelTaskDrawer from "../components/NovelTaskDrawer";
import OutlineTab from "../components/OutlineTab";
import PipelineTab from "../components/PipelineTab";
import StoryMacroPlanTab from "../components/StoryMacroPlanTab";
import StructuredOutlineTab from "../components/StructuredOutlineTab";
import VersionHistoryTab from "../components/VersionHistoryTab";
import type { NovelEditViewProps } from "../components/NovelEditView.types";
import { normalizeNovelWorkspaceTab, type NovelWorkspaceTab } from "../novelWorkspaceNavigation";
import MobileNovelStepNav from "./MobileNovelStepNav";
import { getMobileNovelWorkspaceStatusText } from "./mobileNovelWorkspaceUtils";

export default function MobileNovelEditView(props: NovelEditViewProps) {
  const {
    id,
    activeTab,
    workflowCurrentTab,
    exportControls,
    basicTab,
    storyMacroTab,
    outlineTab,
    structuredTab,
    chapterTab,
    pipelineTab,
    characterTab,
    takeover,
    taskDrawer,
    activeStepTakeoverEntry,
  } = props;
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);

  const normalizedActiveTab = normalizeNovelWorkspaceTab(activeTab);
  const novelTitle = basicTab.basicForm.title.trim() || "未命名小说";
  const statusText = getMobileNovelWorkspaceStatusText({
    activeTab: normalizedActiveTab,
    workflowCurrentTab: workflowCurrentTab ?? normalizedActiveTab,
  });
  const isTakeoverLoading = takeover?.mode === "loading";
  const hideTakeoverEntry = takeover?.mode === "running" || takeover?.mode === "waiting";

  const renderActivePanel = () => {
    switch (normalizedActiveTab) {
      case "basic":
        return <BasicInfoTab {...basicTab} />;
      case "story_macro":
        return <StoryMacroPlanTab {...storyMacroTab} />;
      case "character":
        return <NovelCharacterPanel {...characterTab} />;
      case "outline":
        return <OutlineTab {...outlineTab} />;
      case "structured":
        return <StructuredOutlineTab {...structuredTab} />;
      case "chapter":
        return <ChapterManagementTab {...chapterTab} />;
      case "pipeline":
        return <PipelineTab {...pipelineTab} />;
      case "history":
        return <VersionHistoryTab novelId={id} />;
      default:
        return <BasicInfoTab {...basicTab} />;
    }
  };

  const selectTab = (tab: NovelWorkspaceTab) => {
    props.onActiveTabChange(tab);
  };

  const taskAttentionLabel = taskDrawer?.task
    ? taskDrawer.task.status === "failed"
      ? "异常"
      : taskDrawer.task.status === "waiting_approval"
        ? "待确认"
        : taskDrawer.task.status === "running" || taskDrawer.task.status === "queued"
          ? "进行中"
          : "最近任务"
    : null;

  return (
    <MobileWorkspaceShell
      title={novelTitle}
      subtitle="小说创作工作区"
      statusText={statusText}
      actions={(
        <Dialog open={isToolsOpen} onOpenChange={setIsToolsOpen}>
          <DialogTrigger asChild>
            <Button type="button" size="icon" variant="outline" aria-label="打开创作工具">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[88vh] w-[calc(100vw-1.5rem)] overflow-y-auto rounded-3xl">
            <DialogHeader>
              <DialogTitle>创作工具</DialogTitle>
              <DialogDescription>查看任务、导出正文，或继续当前 AI 创作流程。</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {taskDrawer ? (
                <Button
                  type="button"
                  variant={taskDrawer.task?.status === "failed" ? "destructive" : "outline"}
                  className="w-full justify-between"
                  onClick={() => {
                    taskDrawer.onOpenChange(true);
                    setIsToolsOpen(false);
                  }}
                >
                  <span>查看任务进度</span>
                  {taskAttentionLabel ? <Badge variant="secondary">{taskAttentionLabel}</Badge> : null}
                </Button>
              ) : null}

              <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="outline" className="w-full justify-start">导出小说正文</Button>
                </DialogTrigger>
                <DialogContent className="w-[calc(100vw-1.5rem)] rounded-3xl">
                  <DialogHeader>
                    <DialogTitle>导出小说正文</DialogTitle>
                    <DialogDescription>选择导出范围和文件格式。</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 text-sm">
                    <div className="rounded-2xl border border-border/70 p-3">
                      <div className="text-sm font-medium">当前步骤</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => exportControls.onExportCurrent("markdown")}
                          disabled={!exportControls.canExportCurrentStep || exportControls.isExportingCurrentMarkdown}
                        >
                          {exportControls.isExportingCurrentMarkdown ? "导出中..." : "Markdown"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => exportControls.onExportCurrent("json")}
                          disabled={!exportControls.canExportCurrentStep || exportControls.isExportingCurrentJson}
                        >
                          {exportControls.isExportingCurrentJson ? "导出中..." : "JSON"}
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/70 p-3">
                      <div className="text-sm font-medium">整本书</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => exportControls.onExportFull("markdown")}
                          disabled={exportControls.isExportingFullMarkdown}
                        >
                          {exportControls.isExportingFullMarkdown ? "导出中..." : "Markdown"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => exportControls.onExportFull("json")}
                          disabled={exportControls.isExportingFullJson}
                        >
                          {exportControls.isExportingFullJson ? "导出中..." : "JSON"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </DialogContent>
        </Dialog>
      )}
    >
      <div className="space-y-4">
        <MobileNovelStepNav
          activeTab={normalizedActiveTab}
          workflowCurrentTab={workflowCurrentTab}
          onSelectTab={selectTab}
        />

        {!hideTakeoverEntry ? (
          <div className="rounded-3xl border border-border/70 bg-background p-3 shadow-sm">
            {isTakeoverLoading ? (
              <Button type="button" size="sm" disabled className="w-full">
                <Loader2 className="animate-spin" />
                AI 自动导演接管
              </Button>
            ) : activeStepTakeoverEntry}
          </div>
        ) : null}

        {takeover ? <AITakeoverContainer {...takeover} /> : null}

        <section className="mobile-novel-workspace-panel space-y-4 [&_.grid]:min-w-0 [&_.min-w-0]:min-w-0">
          {renderActivePanel()}
        </section>
      </div>
      {taskDrawer ? <NovelTaskDrawer {...taskDrawer} /> : null}
    </MobileWorkspaceShell>
  );
}
```

- [ ] **Step 2: Connect mobile view in NovelEdit**

Modify imports in `client/src/pages/novels/NovelEdit.tsx`:

```ts
import { useIsMobileViewport } from "@/components/layout/mobile/useIsMobileViewport";
import MobileNovelEditView from "./mobile/MobileNovelEditView";
```

Inside `NovelEdit`, near other hooks after `const queryClient = useQueryClient();`, add:

```ts
  const isMobileViewport = useIsMobileViewport();
```

At the final render, replace the direct `return (<NovelEditView ... />)` with a local component selection:

```tsx
  const NovelWorkspaceView = isMobileViewport ? MobileNovelEditView : NovelEditView;

  return (
    <NovelWorkspaceView
      id={id}
      activeTab={activeTab}
      workflowCurrentTab={workflowCurrentTab}
      exportControls={exportControls}
      basicTab={basicTab}
      storyMacroTab={storyMacroTab}
      outlineTab={outlineTab}
      structuredTab={structuredTab}
      chapterTab={chapterTab}
      pipelineTab={pipelineTab}
      characterTab={characterTab}
      takeover={takeover}
      taskDrawer={taskDrawer}
      activeStepTakeoverEntry={activeStepTakeoverEntry}
    />
  );
```

Use the existing prop list exactly as currently passed to `NovelEditView`; only the component identifier changes.

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @ai-novel/client typecheck`

Expected: PASS. If a prop mismatch appears, compare `MobileNovelEditView` against `NovelEditViewProps` in `client/src/pages/novels/components/NovelEditView.types.ts` and keep the mobile view consuming the same prop contract.

## Task 6: Add Mobile Chapter Editor Wrapper

**Files:**
- Create: `client/src/pages/novels/mobile/MobileChapterEditorShell.tsx`
- Modify: `client/src/pages/novels/NovelChapterEdit.tsx`

- [ ] **Step 1: Create mobile chapter shell wrapper**

Create `client/src/pages/novels/mobile/MobileChapterEditorShell.tsx`:

```tsx
import MobileWorkspaceShell from "@/components/layout/mobile/MobileWorkspaceShell";
import { Button } from "@/components/ui/button";
import ChapterEditorShell from "../components/chapterEditor/ChapterEditorShell";
import type { ChapterEditorShellProps } from "../components/chapterEditor/chapterEditorTypes";

export default function MobileChapterEditorShell(props: ChapterEditorShellProps) {
  const chapterLabel = `第 ${props.chapter.order} 章`;
  const title = props.chapter.title?.trim() ? props.chapter.title : chapterLabel;

  return (
    <MobileWorkspaceShell
      title={title}
      subtitle="章节正文编辑"
      statusText="优先编辑正文；选中文字后可以让 AI 修改片段。"
      actions={(
        <Button type="button" size="sm" variant="outline" onClick={props.onBack}>
          返回
        </Button>
      )}
      className="[&_.xl\\:grid-cols-\\[320px_minmax\\(0\\,1fr\\)_400px\\]]:grid-cols-1"
    >
      <div className="rounded-3xl border border-border/70 bg-background p-3 shadow-sm">
        <ChapterEditorShell {...props} />
      </div>
    </MobileWorkspaceShell>
  );
}
```

- [ ] **Step 2: Connect mobile chapter shell**

Modify imports in `client/src/pages/novels/NovelChapterEdit.tsx`:

```ts
import { useIsMobileViewport } from "@/components/layout/mobile/useIsMobileViewport";
import MobileChapterEditorShell from "./mobile/MobileChapterEditorShell";
```

Inside `NovelChapterEdit`, after `const navigate = useNavigate();`, add:

```ts
  const isMobileViewport = useIsMobileViewport();
```

Before the final `return`, add:

```ts
  const EditorShell = isMobileViewport ? MobileChapterEditorShell : ChapterEditorShell;
```

In the final JSX, replace `<ChapterEditorShell ... />` with `<EditorShell ... />` while keeping all props unchanged.

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @ai-novel/client typecheck`

Expected: PASS.

## Task 7: Add Minimal Mobile CSS Guardrails

**Files:**
- Modify: `client/src/index.css`

- [ ] **Step 1: Add safe mobile overflow rules**

Append to `client/src/index.css`:

```css
@layer utilities {
  .mobile-novel-workspace-panel {
    overflow-wrap: anywhere;
  }

  .mobile-safe-bottom {
    padding-bottom: max(1.5rem, env(safe-area-inset-bottom));
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @ai-novel/client typecheck`

Expected: PASS.

## Task 8: Final Verification

**Files:**
- Verify: `client/src/pages/novels/NovelEdit.tsx`
- Verify: `client/src/pages/novels/NovelChapterEdit.tsx`
- Verify: `client/src/pages/novels/mobile/*`
- Verify: `client/src/components/layout/mobile/*`

- [ ] **Step 1: Run helper tests**

Run: `node client/tests/mobileNovelWorkspaceUtils.test.js`

Expected: PASS with 2 tests passing.

- [ ] **Step 2: Run client typecheck**

Run: `pnpm --filter @ai-novel/client typecheck`

Expected: PASS.

- [ ] **Step 3: Run production build if typecheck passes**

Run: `pnpm --filter @ai-novel/client build`

Expected: PASS and Vite build completes.

- [ ] **Step 4: Manual desktop verification**

Run the app and open a desktop-width browser. Verify:

- `/novels/:id/edit` still shows the existing desktop top bar, left navigation, and desktop `NovelEditView` layout.
- `/novels/:id/chapters/:chapterId` still shows the existing desktop chapter editor layout.
- Sidebar collapse state and workspace navigation toggle still behave as before.

- [ ] **Step 5: Manual mobile verification**

Open the same routes with a phone-width viewport or a phone on the LAN. Verify:

- `/novels/:id/edit` shows the mobile shell title, horizontal step navigation, and current tab content.
- Selecting steps changes the same workspace tab without navigating away.
- The tool button opens task/export actions.
- `/novels/:id/chapters/:chapterId` shows a mobile shell around the chapter editor and keeps the back action visible.
- Editing and saving chapter content still works.

- [ ] **Step 6: Review UI copy**

Search new files:

Run: `rg -n "现在|不再|已经|之前|原本|迁回|升级为|改造|迁移" client/src/components/layout/mobile client/src/pages/novels/mobile`

Expected: no matches in user-facing copy. If matches appear in comments or internal names only, confirm they are not visible to users; otherwise rewrite the copy from the user's perspective.
