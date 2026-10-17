import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'tests',`.world-deepening-${process.pid}.mjs`);
let render;
before(async()=>{
  const {build}=createRequire(import.meta.resolve('vite'))('esbuild');
  await build({stdin:{resolveDir:root,loader:'tsx',contents:`
    import React from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import Tab,{collectWorldAnswerDrafts} from './src/pages/worlds/components/workspace/WorldDeepeningTab';
    export function render(question,drafts={},pending=false){return {
      submitted:collectWorldAnswerDrafts([question],drafts),
      html:renderToStaticMarkup(<Tab questions={[question]} answerDrafts={drafts} setAnswerDrafts={()=>{}}
        llmQuickOptions={{}} generatePending={false} submitPending={pending} onGenerate={()=>{}} onSubmit={()=>{}} />),
    }}
  `},bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',outfile:output,logLevel:'silent'});
  ({render}=await import(pathToFileURL(output).href));
});
after(()=>{if(fs.existsSync(output))fs.unlinkSync(output)});
const question={id:'q1',worldId:'world',question:'谁签发通行证？',answer:'商会签发',status:'integrated',
  integratedSummary:JSON.stringify({version:1,summary:'通行规则已补入手册',answerHash:'a'.repeat(64)})};
test('saved answers and integration summaries remain readable after drafts are cleared',()=>{
  const result=render(question);
  assert.match(result.html,/商会签发/);assert.match(result.html,/通行规则已补入手册/);assert.match(result.html,/已整合/);
  assert.deepEqual(result.submitted,{});assert.match(result.html,/disabled=""[^>]*>提交并整合回答/);
});
test('legacy saved answers remain available for explicit structured integration',()=>{
  const result=render({...question,integratedSummary:'Q:旧问题\nA:商会签发'});
  assert.deepEqual(result.submitted,{q1:'商会签发'});assert.match(result.html,/回答已保存，可提交整合/);
  assert.doesNotMatch(result.html,/disabled=""[^>]*>提交并整合回答/);
});
test('editing a saved answer submits the new draft and clearing it does not restore the previous answer',()=>{
  assert.deepEqual(render(question,{q1:'居民议会签发'}).submitted,{q1:'居民议会签发'});
  assert.match(render(question,{q1:'居民议会签发'}).html,/待整合/);
  assert.deepEqual(render(question,{q1:''}).submitted,{});
});
test('an in-flight submission displays the answer while preventing another submission',()=>{
  const result=render(question,{q1:'新回答'},true);
  assert.match(result.html,/新回答/);assert.match(result.html,/disabled=""[^>]*>整合中/);
});
