import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {nodeStyles} from './support/nodeStyles.js';
import {resolveSelection} from '../src/pages/directorNext/workspace/model.ts';

test('ledger and character inventory selection survive refresh and reject another book character',()=>{
  const book={chapters:[{id:'chapter',content:'正文'}],materials:{characters:[{id:'hero'}],volumes:[]}};
  for(const selection of [{kind:'foreshadowing'},{kind:'resources'},{kind:'character_resources',id:'hero'}]) assert.deepEqual(resolveSelection(selection,book),selection);
  assert.deepEqual(resolveSelection({kind:'character_resources',id:'foreign'},book),{kind:'chapter',id:'chapter'});
});

test('ledger views show saved status and evidence without pretending pending proposals are inventory',async()=>{
  const {build}=createRequire(import.meta.resolve('vite'))('esbuild');
  const root=fileURLToPath(new URL('..',import.meta.url));
  const output=path.join(root,'tests',`.ledgers-${Date.now()}.mjs`);
  try {
    await build({stdin:{contents:`
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {LedgerView,resolveLedgerChapter,characterResources} from './src/pages/directorNext/workspace/ledgers';
import {ResourceDirectory} from './src/pages/directorNext/workspace/ResourceDirectory';
import {CharacterDetail} from './src/pages/directorNext/workspace/assets';
import {previewBook} from './src/pages/directorNext/workspace/previewBook';
const book={...previewBook,novel:{...previewBook.novel,id:'book'},chapters:[{id:'chapter',order:2,title:'来源章',content:'保存正文'}],materials:{...previewBook.materials,characters:[{id:'hero',name:'主角',role:'主角'},{id:'ally',name:'同伴',role:'配角'}]}};
const resources=[{id:'used',novelId:'book',name:'旧信物',summary:'已使用信物',status:'consumed',holderCharacterId:'hero',ownerCharacterId:'ally',holderCharacterName:'主角',ownerName:'同伴',resourceType:'physical_item',narrativeFunction:'key',constraints:['只能使用一次'],sourceRefs:[],evidence:[],riskSignals:[],readerKnows:true,holderKnows:true},{id:'ally-item',novelId:'book',name:'同伴药瓶',summary:'药瓶',status:'available',holderCharacterId:'ally',constraints:[],sourceRefs:[],evidence:[],riskSignals:[]},{id:'foreign',novelId:'other',name:'其他小说资源',holderCharacterId:'hero'}];
const data={novelId:'book',payoffs:[{id:'promise',novelId:'book',title:'刀的来历',summary:'保存的伏笔',currentStatus:'pending_payoff',targetStartChapterOrder:5,targetEndChapterOrder:8,setupChapterId:'chapter',firstSeenChapterOrder:2,sourceRefs:[],evidence:[{summary:'正文中的刀纹',chapterId:'chapter'}],riskSignals:[],statusReason:'等待揭晓'}],resources:resources.slice(0,2),resourceEvents:[{id:'event',resourceId:'used',eventType:'consumed',summary:'信物已经用掉',chapterId:'chapter',chapterOrder:2,evidence:['正文证据']}],pendingResources:[{id:'pending',summary:'归属需核对',riskLevel:'high',chapterId:'chapter',payload:{resourceName:'未核实宝物'},validationNotes:['证据不足'],evidence:['候选证据']}],warnings:[]};
const cache=new QueryClient();cache.setQueryData(['directorWorkspaceLedgers','book'],{success:true,data});
function render(selection){return renderToStaticMarkup(<QueryClientProvider client={cache}><LedgerView book={book} selection={selection} onSelect={()=>{}}/></QueryClientProvider>)}
export const payoff=render({kind:'foreshadowing'});
export const inventory=render({kind:'character_resources',id:'hero'});
export const directory=renderToStaticMarkup(<ResourceDirectory book={book} selected={{kind:'resources'}} onSelect={()=>{}}/>);
export const character=renderToStaticMarkup(<CharacterDetail character={book.materials.characters[0]} onCharacter={()=>{}} onResources={()=>{}}/>);
export const scoped=characterResources(resources,'book','hero').map(row=>row.id);
export const sources=[resolveLedgerChapter(book,{chapterId:'deleted',chapterOrder:2}),resolveLedgerChapter(book,{chapterOrder:2}),resolveLedgerChapter({...book,chapters:[...book.chapters,{id:'duplicate',order:2}]},{chapterOrder:2})];
cache.getQueryCache().find({queryKey:['directorWorkspaceLedgers','book']}).setState({status:'error',error:new Error('offline')});
export const stale=render({kind:'foreshadowing'});
cache.setQueryData(['directorWorkspaceLedgers','book'],{success:true,data:{...data,novelId:'other'}});
export const wrongBook=render({kind:'foreshadowing'});
cache.setQueryData(['directorWorkspaceLedgers','book'],{success:true,data:{...data,payoffs:[],resources:[],resourceEvents:[],pendingResources:[]}});
export const empty=render({kind:'foreshadowing'});
`,resolveDir:root,loader:'tsx'},bundle:true,platform:'node',format:'esm',packages:'external',plugins:[nodeStyles],alias:{'@':path.join(root,'src')},define:{'import.meta.env':'{}'},outfile:output});
    const result=await import(pathToFileURL(output).href);
    for(const text of ['刀的来历','待兑现','正文中的刀纹','来源章','全书最新保存状态']) assert.ok(result.payoff.includes(text),text);
    for(const text of ['旧信物','已消耗','只能使用一次','信物已经用掉','归属需核对','证据不足']) assert.ok(result.inventory.includes(text),text);
    assert.ok(!result.inventory.includes('同伴药瓶'));
    assert.doesNotMatch(result.inventory,/确认并用于后续写作|回填最近章节/);
    assert.ok(result.directory.includes('伏笔')&&result.directory.includes('背包与资源'));
    assert.ok(result.character.includes('查看背包与资源'));
    assert.deepEqual(result.scoped,['used']);
    assert.equal(result.sources[0],null,'invalid saved id cannot fall back to a matching number');
    assert.equal(result.sources[1].id,'chapter');
    assert.equal(result.sources[2],null,'duplicate order cannot guess a chapter');
    assert.match(result.stale,/role="alert"/);assert.ok(result.stale.includes('刀的来历'),'failed refresh keeps previously saved results');
    assert.match(result.wrongBook,/role="alert"/);assert.ok(!result.wrongBook.includes('刀的来历'),'wrong-book response cannot be displayed');
    assert.ok(result.empty.includes('暂无保存的伏笔记录'));assert.doesNotMatch(result.empty,/role="alert"/);
  } finally {fs.rmSync(output,{force:true});}
});
