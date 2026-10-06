import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {getNovelWorkspaceHref} from '../src/lib/novelRoutes.ts';

test('book source routing overrides legacy experience but cannot open another book or external address',()=>{
  for(const creationExperience of ['simple','professional']) {
    assert.equal(getNovelWorkspaceHref({id:'book /1',creationExperience,workspaceSourceRoute:'/lab/director/book%20%2F1'}),'/lab/director/book%20%2F1');
  }
  assert.equal(getNovelWorkspaceHref({id:'book',narrativeForm:'short_story',workspaceSourceRoute:'/lab/director/book'}),'/novels/book/story');
  for(const workspaceSourceRoute of ['/lab/director/other','https://example.com/','//example.com/']) {
    assert.equal(getNovelWorkspaceHref({id:'book',workspaceSourceRoute}),'/novels/book/edit');
  }
});

test('shelf, continue and project cards navigate to the director without old progress or continuation',async()=>{
  const clientDir=fileURLToPath(new URL('..',import.meta.url));
  const output=path.join(clientDir,'tests',`.director-shelf-${Date.now()}.mjs`);
  const {build}=createRequire(import.meta.resolve('vite'))('esbuild');
  try {
    await build({stdin:{resolveDir:clientDir,loader:'tsx',contents:`
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {NovelProjectCard} from './src/pages/novels/components/list/NovelProjectCard';
import {NovelShelfCard,NovelContinueCard} from './src/pages/novels/components/list/NovelShelfCard';
export function renderCards() {
 const novel={id:'book',title:'验收小说',description:'故事',status:'draft',narrativeForm:'long_novel',creationExperience:'simple',workspaceSourceRoute:'/lab/director/book',updatedAt:'2026-10-03T00:00:00Z',_count:{chapters:0,characters:0},latestAutoDirectorTask:{id:'old',status:'running',progress:1,currentStage:'旧推进阶段',currentItemLabel:'旧推进动作',displayStatus:'旧导演运行中'}};
 const noop=()=>{};
 return [renderToStaticMarkup(<MemoryRouter><NovelProjectCard novel={novel} onOpenNovel={noop} onOpenCockpit={noop} onContinueWorkflow={noop} onDownload={noop} onDelete={noop}/></MemoryRouter>),renderToStaticMarkup(<MemoryRouter><NovelShelfCard novel={novel} onManageCover={noop} onDownload={noop} onDelete={noop}/></MemoryRouter>),renderToStaticMarkup(<MemoryRouter><NovelContinueCard novel={novel} onManageCover={noop} onDelete={noop}/></MemoryRouter>)];
}`},bundle:true,platform:'node',format:'esm',packages:'external',alias:{'@':path.join(clientDir,'src')},define:{'import.meta.env':'{}'},loader:{'.webp':'dataurl'},outfile:output});
    const {renderCards}=await import(pathToFileURL(output).href);
    for(const markup of renderCards()) {
      assert.match(markup,/href="\/lab\/director\/book"/);
      assert.match(markup,/打开导演台/);
      assert.doesNotMatch(markup,/旧推进阶段|旧推进动作|旧导演运行中|100%|继续导演/);
    }
  } finally {if(fs.existsSync(output))fs.unlinkSync(output);}
});
