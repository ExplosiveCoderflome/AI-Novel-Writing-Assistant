import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';

test('reading an empty novel and requesting AI takeover open the book director without old setup controls',async()=>{
  const clientDir=fileURLToPath(new URL('..',import.meta.url));
  const output=path.join(clientDir,'tests',`.director-book-entry-${Date.now()}.mjs`);
  const {build}=createRequire(import.meta.resolve('vite'))('esbuild');
  try {
    await build({stdin:{resolveDir:clientDir,loader:'tsx',contents:`
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {queryKeys} from './src/api/queryKeys';
import NovelPreview from './src/pages/novels/NovelPreview';
import Takeover from './src/pages/novels/components/NovelExistingProjectTakeoverDialog';
export function renderEntries(source = '/lab/director/book') {
 const cache=new QueryClient({defaultOptions:{queries:{staleTime:Infinity,retry:false}}});
 cache.setQueryData(queryKeys.novels.detail('book'),{success:true,data:{id:'book',title:'验收小说',description:'故事方向',narrativeForm:'long_novel',workspaceSourceRoute:source}});
 cache.setQueryData(queryKeys.novels.chapters('book'),{success:true,data:[]});
 const render=(child)=>renderToStaticMarkup(<QueryClientProvider client={cache}><MemoryRouter initialEntries={['/novels/book/preview']}>{child}</MemoryRouter></QueryClientProvider>);
 return [render(<Routes><Route path='/novels/:id/preview' element={<NovelPreview/>}/></Routes>),render(<Takeover novelId='book' basicForm={{postGenerationStyleReviewEnabled:false}} workflowTaskId='old-task'/>)];
}`},bundle:true,platform:'node',format:'esm',packages:'external',alias:{'@':path.join(clientDir,'src')},define:{'import.meta.env':'{}'},loader:{'.webp':'dataurl','.png':'dataurl','.svg':'dataurl'},outfile:output});
    const {renderEntries}=await import(pathToFileURL(output).href);
    for(const markup of renderEntries()) {
      assert.match(markup,/href="\/lab\/director\/book"/);
      assert.match(markup,/打开导演台/);
      assert.doesNotMatch(markup,/href="\/novels\/book\/edit"|自动导演接管|推进到可开写/);
    }
    const unknown=renderEntries('/lab/director/other')[1];
    assert.match(unknown,/重新读取创作入口/);
    assert.doesNotMatch(unknown,/href="\/lab\/director\/other"|继续自动导演/);
    const disabled=renderEntries(null);
    assert.match(disabled[0],/href="\/novels\/book\/edit"/);
    assert.match(disabled[1],/AI 自动导演接管/);
  }finally{if(fs.existsSync(output))fs.unlinkSync(output);}
});
