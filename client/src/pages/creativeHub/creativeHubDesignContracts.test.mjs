import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const creativeHubRoot = dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => readFileSync(join(creativeHubRoot, relativePath), "utf8");

function collectSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(path);
    }
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

test("production settings expose visible labels and recoverable detail loading", () => {
  const source = read("components/NovelProductionStarterCard.tsx");
  const fieldIds = [
    "creative-hub-production-title",
    "creative-hub-production-description",
    "creative-hub-production-genre",
    "creative-hub-production-style",
    "creative-hub-production-pov",
    "creative-hub-production-pace",
    "creative-hub-production-mode",
    "creative-hub-production-emotion",
    "creative-hub-production-freedom",
    "creative-hub-production-chapters",
    "creative-hub-production-length",
    "creative-hub-production-world",
  ];

  for (const id of fieldIds) {
    assert.match(source, new RegExp(`htmlFor="${id}"`));
    assert.match(source, new RegExp(`id="${id}"`));
  }
  assert.match(source, /novelDetailQuery\.error/);
  assert.match(source, /novelDetailQuery\.refetch\(\)/);
  assert.match(source, /submitMutation\.isPending/);
  assert.match(source, /disabled=\{formDisabled\}/);
});

test("Creative Hub sources stay token based and visually restrained", () => {
  const source = collectSourceFiles(creativeHubRoot).map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}/i);
  assert.doesNotMatch(source, /(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d/);
  assert.doesNotMatch(source, /gradient|shadow-(?:sm|md|lg|xl|2xl)|rounded-(?:xl|2xl|3xl)/);

  for (const component of [
    "components/CreativeHubConversation.tsx",
    "components/CreativeHubSidebar.tsx",
    "components/CreativeHubThreadList.tsx",
  ]) {
    assert.match(read(component), /rounded-lg shadow-none/);
  }
});

test("Creative Hub interactive state exposes accessibility and disabled contracts", () => {
  const page = read("CreativeHubPage.tsx");
  assert.match(read("components/CreativeHubThreadList.tsx"), /aria-current/);
  assert.match(read("components/CreativeHubNovelSetupCard.tsx"), /role="progressbar"/);

  for (const component of [
    "components/CreativeHubDebugTraceCard.tsx",
    "components/CreativeHubInlineToolCall.tsx",
    "components/CreativeHubToolResultCard.tsx",
  ]) {
    const source = read(component);
    assert.match(source, /aria-expanded/);
    assert.match(source, /aria-controls/);
  }

  assert.match(page, /workspaceActionDisabled/);
  assert.match(page, /小说工作区切换失败，请重试/);
  assert.match(page, /<CreativeHubConversation[\s\S]*?actionDisabled=\{workspaceActionDisabled\}/);
  assert.match(page, /<CreativeHubThreadList[\s\S]*?actionDisabled=\{threadNavigationDisabled\}/);
  const navigationPolicy = page.slice(
    page.indexOf("const threadNavigationDisabled"),
    page.indexOf("const handleWorkspaceRecommendation"),
  );
  const workspacePolicy = page.slice(
    page.indexOf("const workspaceActionDisabled"),
    page.indexOf("const threadNavigationDisabled"),
  );
  assert.match(workspacePolicy, /!activeThreadId/);
  assert.doesNotMatch(navigationPolicy, /threadLoadError|stateQuery\.error/);
  assert.match(read("components/CreativeHubNovelSetupCard.tsx"), /disabled=\{actionDisabled\}/);
  assert.match(read("components/CreativeHubInlineToolCall.tsx"), /approvalPending/);
  assert.match(read("components/CreativeHubMessagePrimitives.tsx"), /disabled=\{actionDisabled\}/);
});

test("Creative Hub thread switching rejects stale URL, load and stream state", () => {
  const page = read("CreativeHubPage.tsx");
  const runtime = read("hooks/useCreativeHubRuntime.ts");
  assert.match(page, /const activeThreadId = requestedThreadId/);
  assert.match(page, /next\.delete\("threadId"\)/);
  assert.match(page, /activeThreadIdRef\.current === bindingThreadId/);
  assert.match(page, /activeThreadIdRef\.current === interruptThreadId/);
  assert.match(page, /currentLocationKeyRef\.current === createOriginLocationKeyRef\.current/);
  assert.match(runtime, /loadedThreadId === threadId/);
  assert.match(runtime, /threadLoadFailure\?\.threadId === threadId/);
  assert.match(runtime, /sendSessionId === streamSessionRef\.current/);
  assert.match(runtime, /sendInFlightRef\.current \|\| !isCurrentThreadLoaded/);
  assert.match(page, /queryClient\.fetchQuery\(\{[\s\S]*?queryKeys\.creativeHub\.state\(threadId\)/);

  const sessionGuard = runtime.indexOf("streamSessionId !== streamSessionRef.current");
  const firstFrameMutation = runtime.indexOf('frame.event === "creative_hub/run_status"');
  assert.ok(sessionGuard >= 0 && sessionGuard < firstFrameMutation);
});

test("Creative Hub keeps raw resource identifiers inside folded runtime details", () => {
  const sidebar = read("components/CreativeHubSidebar.tsx");
  const approval = read("components/CreativeHubInlineToolCall.tsx");
  assert.match(sidebar, /资源绑定 ID/);
  assert.match(sidebar, /bindingStatusLabel\(bindings\.chapterId\)/);
  assert.doesNotMatch(sidebar, /最近一轮执行摘要/);
  assert.match(approval, /<details[^>]*>[\s\S]*审批目标信息/);
  assert.match(sidebar, /bindings\.novelId && !selectedNovel/);
});

test("collapsed runtime cards keep technical identifiers inside expanded content", () => {
  const source = read("components/CreativeHubDebugTraceCard.tsx");
  const toolCall = read("components/CreativeHubInlineToolCall.tsx");
  const toolResult = read("components/CreativeHubToolResultCard.tsx");
  assert.match(source, /底层执行记录/);
  assert.doesNotMatch(source, /runId\.slice/);
  assert.ok(source.indexOf("Run ID") > source.indexOf("{expanded ? ("));
  assert.doesNotMatch(toolCall, /工具调用 · \{props\.toolName\}/);
  assert.doesNotMatch(toolResult, /errorCode \?\? "失败"/);
  assert.ok(toolResult.indexOf("错误代码：{errorCode}") > toolResult.indexOf("{expanded ? ("));
});

test("Creative Hub module documents its product and dependency boundary", () => {
  const source = read("README.md");
  assert.match(source, /不是小说生产事实源/);
  assert.match(source, /状态优先级/);
  assert.match(source, /不得增加关键词、正则或自由文本分流/);
  assert.match(source, /client\/src\/components\/workspace\//);
});
