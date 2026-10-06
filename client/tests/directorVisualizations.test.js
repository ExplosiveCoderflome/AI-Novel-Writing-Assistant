import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {nodeStyles} from './support/nodeStyles.js';

test('V2 graph views consume saved book data, preserve empty/error states and disable queries in previews', async () => {
  const {build} = createRequire(import.meta.resolve('vite'))('esbuild');
  const clientDir = fileURLToPath(new URL('..', import.meta.url));
  const output = path.join(clientDir,'tests',`.visualizations-${Date.now()}.mjs`);
  try {
    await build({stdin:{contents:`import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {WorldMapView,CharacterGraphView} from './src/pages/directorNext/workspace/visualizations';
import {queryKeys} from './src/api/queryKeys';
import {previewBook} from './src/pages/directorNext/workspace/previewBook';
const novelId='saved-book';
const book={...previewBook,novel:{...previewBook.novel,id:novelId},materials:{...previewBook.materials,
characters:[{id:'hero',name:'主角',role:'捕快',castRole:'protagonist',currentState:'带伤逃离'},{id:'ally',name:'盟友',role:'医者'}],
world:{id:'world-local',name:'本书县城',source:'novel',structure:{profile:{summary:'县城'},rules:{axioms:[]},factions:[],forces:[],locations:[{id:'gate',name:'城门',controllingForceIds:[]},{id:'road',name:'大道',controllingForceIds:[]}],relations:{forceRelations:[],locationControls:[],locationConnections:[{sourceLocationId:'gate',targetLocationId:'road',connectionType:'道路'}]}}}}};
const client=new QueryClient({defaultOptions:{queries:{retry:false,retryOnMount:false,staleTime:Infinity,gcTime:0}}});
client.setQueryData(queryKeys.novels.characterRelations(novelId),{success:true,data:[{id:'saved-relation',novelId,sourceCharacterId:'hero',targetCharacterId:'ally',surfaceRelation:'同盟'},{id:'foreign',novelId:'other',sourceCharacterId:'missing',targetCharacterId:'ally',surfaceRelation:'不应展示'}]});
client.setQueryData(queryKeys.novels.characterDynamicsOverview(novelId),{success:true,data:{novelId,relations:[{id:'stage',novelId,sourceCharacterId:'hero',targetCharacterId:'ally',stageLabel:'互相信任',stageSummary:'联手脱险',sourceType:'chapter',isCurrent:true}]}});
const renderGraph=(preview=false)=>renderToStaticMarkup(<QueryClientProvider client={client}><CharacterGraphView book={book} preview={preview} onOpenCharacter={()=>{}}/></QueryClientProvider>);
export const graph=renderGraph();
export const preview=renderGraph(true);
client.getQueryCache().find({queryKey:queryKeys.novels.characterRelations(novelId)}).setState({status:'error',error:new Error('关系接口不可用'),fetchStatus:'idle'});
export const failed=renderGraph();
export const map=renderToStaticMarkup(<WorldMapView book={book} onOpenWorld={()=>{}}/>);
export const empty=renderToStaticMarkup(<WorldMapView book={{...book,materials:{...book.materials,world:null}}} onOpenWorld={()=>{}}/>);
export const corrupt=renderToStaticMarkup(<WorldMapView book={{...book,materials:{...book.materials,world:{name:'本书县城',structure:null,warnings:['世界详细设定读取失败']}}}} onOpenWorld={()=>{}}/>);
client.clear();`,resolveDir:clientDir,loader:'tsx'},bundle:true,platform:'node',format:'esm',packages:'external',
      alias:{'@':path.join(clientDir,'src')},define:{'import.meta.env':'{}'},outfile:output,
      plugins:[nodeStyles],
    });
    const result = await import(pathToFileURL(output).href);
    assert.match(result.map,/世界地图 · 2 个地点 · 1 条路线/);
    assert.match(result.map,/本书县城/);
    assert.match(result.map,/全屏查看图谱/);
    assert.match(result.empty,/没有可绘制的地点资料/);
    assert.doesNotMatch(result.empty,/个地点 ·/);
    assert.match(result.corrupt,/role="alert"/);
    assert.match(result.corrupt,/世界详细设定读取失败/);
    assert.match(result.graph,/2 个角色/);
    assert.match(result.graph,/1 条关系/);
    assert.match(result.graph,/1 条动态阶段/);
    assert.match(result.graph,/全屏查看/);
    assert.doesNotMatch(result.graph,/角色关系读取失败|不应展示/);
    assert.match(result.preview,/0 条关系/);
    assert.doesNotMatch(result.preview,/1 条动态阶段/);
    assert.match(result.failed,/角色关系读取失败/);
    assert.match(result.failed,/关系接口不可用/);
    assert.match(result.failed,/重新读取关系/);
  } finally {fs.rmSync(output,{force:true});}
});
