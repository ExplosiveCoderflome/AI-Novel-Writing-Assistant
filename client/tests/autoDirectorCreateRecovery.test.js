import assert from "node:assert/strict";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const clientDir = fileURLToPath(new URL("..", import.meta.url));
const { build } = createRequire(import.meta.resolve("vite"))("esbuild");

test("saved wizard inputs restore into the controller and explain the generation button", async () => {
  const output = path.join(clientDir, "tests", `.opening-recovery-${Date.now()}.mjs`);
  try {
    await build({
      stdin: { resolveDir: clientDir, loader: "tsx", contents: `
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {createDefaultNovelBasicFormState,patchNovelBasicForm} from './src/pages/novels/novelBasicInfo.shared';
import {useAutoDirectorCreateController} from './src/pages/novels/autoDirector/useAutoDirectorCreateController';
import StageModelRun from './src/pages/novels/autoDirector/StageModelRun';
import {buildAutoDirectorCreateDraftScope,loadAutoDirectorCreateDraft,saveAutoDirectorCreateDraft} from './src/pages/novels/autoDirector/draft/autoDirectorCreateDraft';
export function save(storage, patch={}) {
  saveAutoDirectorCreateDraft(storage,buildAutoDirectorCreateDraftScope({}),{
    idea:'邮差记得重置前的城市。',
    basicForm:{...createDefaultNovelBasicFormState(),genreId:'fantasy',primaryStoryModeId:'mystery',styleTone:'冷峻',worldId:'world-1'},
    activeStage:'model_run',completedStages:['idea','basic','world_style'],runMode:'auto_to_ready',
    directorVersion:'v1',worldSetupMode:'skip',selectedStyleProfileId:'chosen-style',
    issuePolicy:{maxAutomaticRetries:0,issueActions:{'quality.obligation_gap':'pause_for_manual'}},...patch,
  });
}
export function restore(storage, initialStyleProfileId='entry-style', versionsState='ready') {
  const draft=loadAutoDirectorCreateDraft(storage,buildAutoDirectorCreateDraftScope({}));
  const cache=new QueryClient({defaultOptions:{queries:{staleTime:Infinity,retry:false,retryOnMount:false}}});
  if(versionsState==='ready') {
    cache.setQueryData(['director-versions'],{availableVersions:['v1','v2'],defaultVersion:'v2'});
  } else if(versionsState==='error') {
    cache.getQueryCache().build(cache,{queryKey:['director-versions']}).setState({status:'error',error:new Error('unavailable'),fetchStatus:'idle'});
  }
  let state;
  function Wizard() {
    const controller=useAutoDirectorCreateController({
      initialDraft:draft,initialStyleProfileId,
      basicForm:patchNovelBasicForm(createDefaultNovelBasicFormState(),draft?.basicForm??{}),
      genreOptions:[],storyModeOptions:[],worldOptions:[],onBasicFormChange:()=>{},
    });
    state={idea:controller.idea,basicForm:controller.directorBasicForm,
      directorVersion:controller.directorVersion,worldSetupMode:controller.worldSetupMode,
      selectedStyleProfileId:controller.selectedStyleProfileId,issuePolicy:controller.issuePolicy,
      canGenerate:controller.canGenerate,activeStage:draft?.activeStage,completedStages:draft?.completedStages};
    return <StageModelRun directorVersion={controller.directorVersion}
      availableDirectorVersions={controller.availableDirectorVersions} onDirectorVersionChange={()=>{}}
      basicForm={controller.directorBasicForm} onBasicFormChange={()=>{}}
      canGenerate={controller.canGenerate} generationDisabledReasons={controller.generationDisabledReasons}
      directorVersionsError={controller.directorVersionsError} onRetryDirectorVersions={()=>{}}
      isGenerating={false} onBack={()=>{}} onGenerate={()=>{}} issuePolicyLoading={false} onIssuePolicyChange={()=>{}}/>;
  }
  const markup=renderToStaticMarkup(<QueryClientProvider client={cache}><MemoryRouter><Wizard/></MemoryRouter></QueryClientProvider>);
  cache.clear();
  return {state,markup};
}` },
      bundle: true, platform: "node", format: "esm", packages: "external",
      alias: { "@": path.join(clientDir, "src") }, define: { "import.meta.env": "{}" },
      outfile: output,
    });
    const { save, restore } = await import(pathToFileURL(output).href);
    const values = new Map();
    // Fresh storage wrappers and React trees model reload/back-to-page restoration.
    const storage = () => ({
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key),
    });
    save(storage());
    for (let visit = 0; visit < 3; visit++) {
      const { state, markup } = restore(storage());
      assert.equal(state.idea, "邮差记得重置前的城市。");
      assert.equal(state.basicForm.genreId, "fantasy");
      assert.equal(state.basicForm.primaryStoryModeId, "mystery");
      assert.equal(state.basicForm.styleTone, "冷峻");
      assert.equal(state.basicForm.worldId, "world-1");
      assert.equal(state.worldSetupMode, "skip");
      assert.equal(state.selectedStyleProfileId, "chosen-style");
      assert.equal(state.directorVersion, "v1");
      assert.deepEqual(state.issuePolicy, { maxAutomaticRetries: 0, issueActions: { "quality.obligation_gap": "pause_for_manual" } });
      assert.equal(state.activeStage, "model_run");
      assert.deepEqual(state.completedStages, ["idea", "basic", "world_style"]);
      assert.equal(state.canGenerate, true);
      assert.doesNotMatch(markup, /id="direction-generation-disabled-reasons"/);
      assert.match(markup, /<button(?![^>]*\sdisabled=)[^>]*>开始生成方向<\/button>/);
    }
    save(storage(), { selectedStyleProfileId: "" });
    assert.equal(restore(storage()).state.selectedStyleProfileId, "");
    const loading = restore(storage(), "", "loading");
    assert.equal(loading.state.canGenerate, false);
    assert.match(loading.markup, /正在读取可用导演版本，请稍候。/);
    const failed = restore(storage(), "", "error");
    assert.equal(failed.state.canGenerate, false);
    assert.match(failed.markup, /可用导演版本读取失败，请重试。/);
    assert.match(failed.markup, /重试读取导演版本/);
    save(storage(), { idea: "", basicForm: {} });
    const missing = restore(storage());
    assert.equal(missing.state.canGenerate, false);
    assert.match(missing.markup, /请返回第 1 步填写单书构想。/);
    assert.match(missing.markup, /<button[^>]*disabled=""[^>]*aria-describedby="direction-generation-disabled-reasons"[^>]*>开始生成方向<\/button>/);
  } finally {
    if (existsSync(output)) unlinkSync(output);
  }
});

test("history task identity resets the wizard while draft persistence stays wired to the page", () => {
  const page = readFileSync(path.join(clientDir, "src/pages/novels/autoDirector/AutoDirectorCreatePage.tsx"), "utf8");
  assert.match(page, /<AutoDirectorCreatePage key=\{`\$\{scopeKey\}:\$\{readCandidateTaskId\(searchParams\)/);
  assert.match(page, /loadAutoDirectorCreateDraft\(storage, draftScopeKey\)/);
  assert.match(page, /saveAutoDirectorCreateDraft\(storage, draftScopeKey, \{/);
  assert.match(page, /issuePolicy: controller.issuePolicy/);
  assert.match(page, /generationDisabledReasons=\{controller.generationDisabledReasons\}/);
});
