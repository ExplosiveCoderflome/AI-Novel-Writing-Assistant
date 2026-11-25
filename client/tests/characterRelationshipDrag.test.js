import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { nodeStyles } from "./support/nodeStyles.js";
import { buildRelationshipGraphModel } from "../src/pages/novels/components/characterWorkspace/characterRelationshipGraphModel.ts";
import { CARD_WIDTH, CARD_HEIGHT } from "../src/pages/novels/components/characterWorkspace/relationshipGraph/orderedLayout.ts";

test("dragging keeps anchors stable and restores each book and view until its layout is reset", async t => {
  const { JSDOM } = createRequire(new URL("../../site/package.json", import.meta.url))("jsdom");
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/", pretendToBeVisual: true });
  t.after(() => dom.window.close());
  for (const [name, value] of Object.entries({
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element, SVGElement: dom.window.SVGElement, localStorage: dom.window.localStorage,
    requestAnimationFrame: dom.window.requestAnimationFrame, cancelAnimationFrame: dom.window.cancelAnimationFrame,
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} }, IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, name, original) : delete globalThis[name]);
  }
  dom.window.DOMMatrixReadOnly = class { m22 = 1; };
  const { build } = createRequire(import.meta.resolve("vite"))("esbuild");
  const src = fileURLToPath(new URL("../src", import.meta.url));
  const output = new URL(`./.relationship-drag-${process.pid}.mjs`, import.meta.url);
  t.after(() => rm(output, { force: true }));
  await build({
    entryPoints: [src + "/pages/novels/components/characterWorkspace/CharacterRelationshipGraphPanel.tsx"],
    outfile: fileURLToPath(output), bundle: true, packages: "external", platform: "node", format: "esm",
    alias: { "@": src }, plugins: [nodeStyles],
  });
  const { createElement: h, act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { ReactFlowProvider, useStoreApi } = await import("@xyflow/react");
  const { default: Panel } = await import(output.href);
  const root = createRoot(document.getElementById("root"));
  let store;
  function Probe() { store = useStoreApi(); return null; }
  const characters = [{ id: "a", name: "陈默", castRole: "protagonist" }, { id: "b", name: "周海" }];
  const input = { characters, mode: "all", selectedCharacterId: "",
    staticRelations: [{ sourceCharacterId: "a", targetCharacterId: "b", surfaceRelation: "同盟" }], dynamicRelations: [] };
  const render = (model, props = {}) => act(() => root.render(h(ReactFlowProvider, {}, h(Probe), h(Panel, {
    novelId: "book-A", model, mode: "all", onModeChange() {}, selectedCharacterId: "", onSelectedCharacterChange() {}, ...props,
  }))));
  try {
    await render(buildRelationshipGraphModel(input));
    const updates = new Map();
    for (const element of document.querySelectorAll(".react-flow__node")) {
      Object.defineProperties(element, { offsetWidth: { value: CARD_WIDTH }, offsetHeight: { value: CARD_HEIGHT } });
      updates.set(element.dataset.id, { id: element.dataset.id, nodeElement: element, force: true });
    }
    await act(() => store.getState().updateNodeInternals(updates));
    const node = id => store.getState().nodeLookup.get(id);
    const move = (position, dragging, id = "a") => act(() => store.getState().updateNodePositions(new Map([[id, { position }]]), dragging));
    const start = node("a").position;
    const handles = node("a").internals.handleBounds;
    assert.equal(handles.source.length, 4);
    const stationary = node("b");
    const edges = store.getState().edges;
    const landing = { x: stationary.position.x, y: stationary.position.y + 36 };
    const storageBeforeDrag = { ...window.localStorage };
    for (const position of [{ x: start.x + 5, y: start.y + 8 }, landing]) {
      await move(position, true);
      assert.deepEqual(node("a").measured, { width: CARD_WIDTH, height: CARD_HEIGHT });
      assert.deepEqual(node("a").internals.positionAbsolute, { x: position.x - CARD_WIDTH / 2, y: position.y - CARD_HEIGHT / 2 });
      assert.equal(node("b"), stationary);
      assert.equal(node("a").internals.handleBounds, handles);
      assert.equal(store.getState().edges, edges);
      assert.deepEqual({ ...window.localStorage }, storageBeforeDrag);
    }

    await render(buildRelationshipGraphModel({ ...input, characters: [{ ...characters[0], currentGoal: "寻找证人" }, characters[1]] }));
    assert.deepEqual(node("a").position, landing);
    assert.equal(node("a").data.graphNode.character.currentGoal, "寻找证人");
    assert.equal(node("a").internals.handleBounds, handles);
    await move(landing, false);
    assert.deepEqual(node("a").position, landing);
    assert.notEqual(store.getState().edges[0].sourceHandle, edges[0].sourceHandle);
    const reset = document.querySelector('[aria-label="恢复自动排列"]');
    assert.equal(reset.disabled, false);
    await act(() => reset.click());
    assert.deepEqual(node("a").position, start);
    assert.equal(reset.disabled, true);
    // React Flow sends a settled position without a preceding drag for arrow keys.
    await move(landing, false);
    assert.deepEqual(node("a").position, landing);
    assert.equal(reset.disabled, false);

    const book = buildRelationshipGraphModel(input);
    const secondLanding = { x: 0, y: -45 };
    const reopen = async () => {
      await act(() => root.render(null));
      await render(book);
    };
    await reopen();
    assert.deepEqual(node("a").position, landing);
    await render(book, { novelId: "book-B" });
    assert.deepEqual(node("a").position, start);
    await move(secondLanding, false);
    await move(landing, false, "b");

    const focus = id => {
      const props = { mode: "current", selectedCharacterId: id };
      return render(buildRelationshipGraphModel({ ...input, ...props }), props);
    };
    await focus("a");
    const treeStart = node("a").position;
    await move(secondLanding, false);
    await focus("b");
    assert.notDeepEqual(node("a").position, secondLanding);
    await focus("a");
    assert.deepEqual(node("a").position, secondLanding);
    const resetCurrent = () => act(() => document.querySelector('[aria-label="恢复自动排列"]').click());
    await resetCurrent();
    assert.deepEqual(node("a").position, treeStart);

    await render(book, { novelId: null });
    assert.deepEqual(node("a").position, start);
    await move(secondLanding, false);
    await reopen();
    assert.deepEqual(node("a").position, landing);
    await resetCurrent();
    await reopen();
    assert.deepEqual(node("a").position, start);
    assert.equal(document.querySelector('[aria-label="恢复自动排列"]').disabled, true);
    await render(book, { novelId: "book-B" });
    assert.deepEqual(node("a").position, secondLanding);
    assert.deepEqual(node("b").position, landing);
  } finally {
    await act(() => root.unmount());
  }
});
