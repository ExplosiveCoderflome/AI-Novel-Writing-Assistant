import test from "node:test";
import assert from "node:assert/strict";
import {suggestVolumeQuotas,suggestedChapterCount,nextUnwrittenChapter} from "../src/pages/outlines/openBook/model.ts";
import {resolveSavedReview} from "../src/pages/directorNext/workspace/review.ts";
const document={volumes:[{nodeId:"a",order:0,planningDepth:"detailed"},{nodeId:"b",order:1,planningDepth:"rough"},{nodeId:"c",order:2,planningDepth:"rough"}],chapters:[{volumeNodeId:"a"},{volumeNodeId:"a"},{volumeNodeId:"c"}]};
test("complete outlines keep their actual chapter count; rough volume allocation never shrinks existing chapters",()=>{
  const complete={...document,volumes:[document.volumes[0]],chapters:document.chapters.slice(0,2)};
  assert.equal(suggestedChapterCount(complete),2);
  assert.deepEqual(suggestVolumeQuotas(complete,2),{a:2});
  const quotas=suggestVolumeQuotas(document,12);
  assert.equal(quotas.a,2);assert.equal(quotas.a+quotas.b+quotas.c,12);assert.ok(quotas.b>=1 && quotas.c>=1);
  assert.equal(suggestedChapterCount(document),80);
  assert.deepEqual(suggestVolumeQuotas({volumes:[],chapters:[]},80),{});
});
test("only the first unwritten chapter is suggested, not a future explicit chapter plus one",()=>{
  assert.equal(nextUnwrittenChapter([{order:1,content:"已保存"},{order:2,content:"手改"},{order:9,content:null}],12),3);
  assert.equal(nextUnwrittenChapter([{order:9,content:"远期正文"}],12),1);
  assert.equal(nextUnwrittenChapter([{order:1,content:"完成"}],1),null);
});
test("every A2 preparation gate reviews saved current-book results and rejects foreign or missing identities",()=>{
  const book={novel:{id:"book"},materials:{world:null,characters:[]},chapters:[],outlinePreparation:{storyMacro:{expansion:{expanded_premise:"保留源纲"},decomposition:{ending_flavor:"约定结局"}},hasBookContract:true,worldMode:"skip"},planning:{volumes:[{id:"v",chapters:[{title:"已有章"}]}],beatSheets:[{volumeId:"v",beats:[{title:"保存的节奏"}]}]}};
  for (const type of ["story_macro","book_contract","world_skeleton","volume_beat_sheet","volume_chapter_list"]) {
    const context={type,novelId:"book",runId:"run",controlVersion:4,volumeId:"v"};
    const params=new URLSearchParams("review="+type);
    assert.equal(resolveSavedReview({...book,reviewContexts:[context]},params).ready,true,type);
    assert.equal(resolveSavedReview({...book,reviewContexts:[{...context,novelId:"foreign"}]},params).ready,false,type);
    assert.equal(resolveSavedReview({...book,reviewContexts:[]},params).ready,false,type);
    if (type.startsWith("volume_")) assert.equal(resolveSavedReview({...book,reviewContexts:[{...context,volumeId:"other"}]},params).ready,false);
  }
  assert.equal(resolveSavedReview({...book,outlinePreparation:{},reviewContexts:[{type:"book_contract",novelId:"book"}]},new URLSearchParams("review=book_contract")).ready,false);
});
